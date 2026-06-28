import path from 'path'
import fs from 'fs'
import { pathToFileURL } from 'url'
import { app } from 'electron'
import selectors from './selectors.json'

// 让 Playwright 在「随包内核」里找浏览器，而不是用户机器的 %LOCALAPPDATA%\ms-playwright。
// 值 '0' = 内核存放在 playwright-core 包目录下的 .local-browsers（已被 asarUnpack 解包，随安装包分发）。
// 必须在 import('playwright') 之前设置，故放在模块顶层。
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0'
}

// 本地测试模式：DOUYIN_MOCK=1 时，自动化指向本地假发布页，不碰真实抖音。
const MOCK = process.env.DOUYIN_MOCK === '1'
const mockUrl = (name) => pathToFileURL(path.join(app.getAppPath(), 'mock', name)).href
const postUrl = () => (MOCK ? mockUrl('creator-post.html') : selectors.postUrl)
// 上传页：先在这里选取本地视频，选完抖音会自动跳转到发布页(post/video)
const uploadUrl = () => (MOCK ? mockUrl('creator-post.html') : selectors.uploadUrl)
const homeUrl = () => (MOCK ? mockUrl('creator-home.html') : selectors.homeUrl)
const mockSample = () => path.join(app.getAppPath(), 'mock', 'sample.mp4')

// 懒加载 chromium：优先 playwright-extra + stealth，回退原生 playwright。
// 用动态 import 避免启动时就把 playwright 加载进来。
let _chromium = null
async function getChromium() {
  if (_chromium) return _chromium
  try {
    const pe = await import('playwright-extra')
    const stealth = (await import('puppeteer-extra-plugin-stealth')).default
    pe.chromium.use(stealth())
    _chromium = pe.chromium
  } catch {
    const pw = await import('playwright')
    _chromium = pw.chromium
  }
  return _chromium
}

function profileKey(account) {
  const raw = account.id != null ? `id-${account.id}` : account.name || 'default'
  return String(raw).replace(/[^\w一-龥-]/g, '_')
}

/**
 * 为某账号启动独立 Chromium —— 每账号一套完全独立、互不干扰的「虚拟设备」：
 * 独立持久化 Profile（隔离 Cookie / 登录态）+ 独立 UA / 代理 IP / 时区 / 语言。
 */
export async function launchForAccount(account) {
  const profileDir = path.join(app.getPath('userData'), 'profiles', profileKey(account))
  fs.mkdirSync(profileDir, { recursive: true })
  const opts = {
    headless: false,
    viewport: null,
    locale: account.locale || 'zh-CN',
    timezoneId: account.timezone || 'Asia/Shanghai',
    userAgent: account.ua || undefined,
    proxy: account.proxy ? { server: account.proxy } : undefined,
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized']
  }
  // 先用（可能带 stealth 的）chromium 启动；若 stealth 包装下 launchPersistentContext 抛错，
  // 回退到原生 playwright，保证浏览器一定能打开。
  try {
    const chromium = await getChromium()
    return await chromium.launchPersistentContext(profileDir, opts)
  } catch (e) {
    const pw = await import('playwright')
    return await pw.chromium.launchPersistentContext(profileDir, opts)
  }
}

// 「环境ID 一对一绑定」：同一个账号(=环境ID) 只维护一个浏览器环境。
// 同 ID 重复调用 → 复用已开的那个（不会再开第二个，避免 Profile 占用冲突）；
// 不同 ID → 各自独立进程/目录，天然并行、互不干扰。
const contexts = new Map() // profileKey(envId) -> BrowserContext
async function acquireContext(account) {
  const key = profileKey(account)
  const cached = contexts.get(key)
  if (cached) {
    try {
      cached.pages() // 已关闭的 context 调用会抛错
      return cached
    } catch {
      contexts.delete(key)
    }
  }
  const ctx = await launchForAccount(account)
  contexts.set(key, ctx)
  ctx.once('close', () => contexts.delete(key))
  return ctx
}

/**
 * 关闭所有已打开的浏览器环境。退出 app 前必须调用，否则残留的 chrome.exe 子进程会
 * 锁住安装目录，导致 Windows 卸载/覆盖安装时报「无法关闭 / Failed to uninstall old application files」。
 */
export async function closeAllContexts() {
  const all = [...contexts.values()]
  contexts.clear()
  await Promise.allSettled(all.map((ctx) => ctx.close()))
}

/**
 * 扫码登录：用该账号的独立指纹浏览器打开 creator.douyin.com，聚焦「我是创作者」二维码，
 * 轮询检测是否扫码登录成功（cookie / URL）。登录态持久化在该账号专属 Profile，供后续发布复用。
 * MOCK 模式打开本地假登录页，点页面里的按钮即可模拟扫码成功，方便 Mac 上测试。
 */
export async function loginAccount(account, status = () => {}) {
  const ctx = await acquireContext(account)
  const page = ctx.pages()[0] || (await ctx.newPage())
  await page.bringToFront().catch(() => {})
  status('opening')
  const url = MOCK ? mockUrl('creator-login.html') : selectors.loginUrl
  await page.goto(url, { waitUntil: 'domcontentloaded' })

  if (!MOCK) {
    // 默认就是「我是创作者」，保险起见点一下，并把二维码滚动居中
    try { await page.click(selectors.creatorTab, { timeout: 3000 }) } catch {}
    try { await page.locator(selectors.qrAnchor).scrollIntoViewIfNeeded({ timeout: 3000 }) } catch {}
  }

  status('waiting_scan')
  const deadline = Date.now() + (selectors.loginTimeout || 180000)
  let logged = false
  while (Date.now() < deadline) {
    if (MOCK) {
      if (/logged/.test(page.url())) { logged = true; break }
    } else {
      // 只认「登录后」才有的 cookie；passport_csrf_token 是一打开登录页就被种的，
      // 不能用来判断登录，否则会在扫码前就误判成功。
      const POST_LOGIN = ['sessionid', 'sessionid_ss', 'sid_guard', 'uid_tt']
      const cookies = await ctx.cookies()
      const hasLoginCookie = cookies.some((c) => POST_LOGIN.includes(c.name.toLowerCase()) && c.value)
      // 扫码确认后会从登录页跳转到 creator-micro/*，这是最可靠的成功信号
      const onApp = /creator-micro/.test(page.url())
      if (hasLoginCookie || onApp) { logged = true; break }
    }
    await page.waitForTimeout(1500)
  }

  if (!logged) {
    if (!MOCK) await ctx.close()
    throw new Error('登录超时，未检测到扫码登录')
  }

  status('logged_in')

  // 抓取登录信息（抖音名称/ID/粉丝/头像）。选择器易变，真实模式尽力而为、失败留空。
  let info = {}
  if (MOCK) {
    info = { dy_name: '数码极客小K', dy_id: 'tech_geek_k', fans: 14300, avatar: '' }
  } else {
    try {
      if (!/creator-micro/.test(page.url())) {
        await page.goto(selectors.homeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      }
      const grab = async (sel) => {
        if (!sel) return ''
        try { return (await page.locator(sel).first().innerText({ timeout: 4000 })).trim() } catch { return '' }
      }
      info.dy_name = await grab(selectors.profileName)
      info.dy_id = await grab(selectors.profileId)
      const fansText = await grab(selectors.profileFans)
      info.fans = Number((fansText || '').replace(/[^\d]/g, '')) || 0
    } catch {}
  }

  // 登录态已写入 Profile 目录；真实模式关闭窗口，MOCK 保留供查看
  if (!MOCK) await ctx.close()
  return { ok: true, info }
}

/**
 * 【核心】上传页优先的「上传 + 填表」流程（不含发布点击）：
 *  1. 打开上传页 creator-micro/content/upload
 *  2. 选取本地视频文件（setInputFiles 触发上传）
 *  3. 抖音自动跳转到发布页 content/post/video
 *  4. 等待表单就绪、视频上传完成
 *  5. 填写标题 / 简介 / 话题
 * 不点击「发布」，由调用方决定是否提交。所有等待都做成「非致命」，
 * 捕获不到标记也继续往下走并打日志，方便调试时定位是哪一步选择器失效。
 */
async function uploadAndFill(page, { videoPath, title, desc = '', topics = [] }, log = () => {}) {
  // 1. 打开上传页（之前是直接进发布页，现改为先进上传页选本地文件）
  const up = uploadUrl()
  log(`打开上传页：${up}`)
  await page.goto(up, { waitUntil: 'domcontentloaded' })

  if (!MOCK && /\/login|passport/.test(page.url())) {
    throw new Error('该账号未登录或登录态已失效，请先在「账号列表」扫码登录')
  }

  // 2. 选取本地视频文件
  let vp = videoPath
  if (MOCK && (!vp || !fs.existsSync(vp))) {
    vp = mockSample()
    log(`【MOCK】原视频路径不存在，改用样例文件：${vp}`)
  }
  if (!MOCK && (!vp || !fs.existsSync(vp))) {
    throw new Error(`视频文件不存在：${vp}`)
  }
  log('等待上传控件 input[type=file] …')
  await page.waitForSelector(selectors.fileInput, { timeout: selectors.uploadTimeout, state: 'attached' })
  log(`选取本地视频：${vp}`)
  await page.setInputFiles(selectors.fileInput, vp)

  // 3. 等待自动跳转到发布页
  log('已选取文件，等待自动跳转到发布页…')
  if (!MOCK) {
    await page
      .waitForURL(new RegExp(selectors.postUrlPattern || 'content/post/video'), { timeout: selectors.uploadTimeout })
      .then(() => log('已跳转到发布页 ✓'))
      .catch(() => log('（未检测到 URL 跳转，可能页面结构有变，继续尝试填表）'))
  }

  // 4. 等待表单 + 视频上传完成（非致命）
  await page
    .waitForSelector(selectors.titleInput, { timeout: selectors.uploadTimeout })
    .catch(() => log('（标题输入框未出现，titleInput 选择器可能需校准）'))
  log('等待视频上传完成…')
  await page
    .waitForSelector(selectors.uploadDone, { timeout: selectors.uploadTimeout })
    .then(() => log('视频上传完成 ✓'))
    .catch(() => log('（未捕获“上传完成”标记，uploadDone 选择器可能需校准，继续填表）'))

  // 5. 填写标题
  if (title) {
    try {
      await page.fill(selectors.titleInput, title)
      log(`已填写标题：${title}`)
    } catch {
      log('（标题填写失败，titleInput 选择器需校准）')
    }
  }

  // 6. 填写简介 / 话题（简介区是 contenteditable，要点进去再输入）
  const caption = [desc, ...topics.map((t) => `#${t}`)].filter(Boolean).join(' ')
  if (caption) {
    try {
      await page.click(selectors.captionEditor)
      await page.keyboard.type(' ' + caption)
      log(`已填写简介/话题：${caption}`)
    } catch {
      log('（简介/话题填写失败，captionEditor 选择器需校准）')
    }
  }

  // 7. 自主声明：打开入口 → 弹窗里选「无需添加」→ 确认（非致命）
  await setDeclaration(page, log)

  // 8. 封面设置：打开入口 → 切到竖封面 → 完成（非致命，需视频已处理出帧）
  await setCover(page, log)
}

/** 点第一个能命中的选择器（逗号分隔的多个候选轮流试），命中返回 true。 */
async function clickFirst(page, selectorList, timeout = 4000) {
  for (const sel of selectorList) {
    if (!sel) continue
    try {
      const loc = page.locator(sel).first()
      await loc.waitFor({ state: 'visible', timeout })
      await loc.click()
      return sel
    } catch {
      /* 试下一个 */
    }
  }
  return null
}

/** 自主声明 → 无需添加 */
async function setDeclaration(page, log = () => {}) {
  log('处理「自主声明」…')
  const entry = await clickFirst(page, [selectors.declareEntry], selectors.modalReadyTimeout)
  if (!entry) {
    log('（未找到「自主声明」入口，可能本账号无此项或选择器需校准，跳过）')
    return
  }
  await page.waitForTimeout(600) // 等弹窗动画
  const none = await clickFirst(page, [selectors.declareNone, selectors.declareNoneAlt], selectors.modalReadyTimeout)
  if (!none) {
    log('（自主声明弹窗里未找到「无需添加/无需声明」选项，选择器需校准）')
    return
  }
  log('已选「无需添加自主声明」')
  await page.waitForTimeout(300)
  const ok = await clickFirst(page, [selectors.declareConfirm], 3000)
  if (ok) log('自主声明已确认 ✓')
  else log('（自主声明无确认按钮或已自动关闭，继续）')
}

/** 封面设置：选竖封面并完成 */
async function setCover(page, log = () => {}) {
  log('处理「封面设置」…')
  const entry = await clickFirst(page, [selectors.coverEntry, selectors.coverEntryAlt], selectors.modalReadyTimeout)
  if (!entry) {
    log('（未找到「选择/设置封面」入口，可能视频尚未处理出帧或选择器需校准，跳过）')
    return
  }
  await page.waitForTimeout(800) // 等封面弹窗 + 帧加载
  const tab = await clickFirst(page, [selectors.coverVerticalTab, selectors.coverVerticalTabAlt], selectors.modalReadyTimeout)
  if (tab) log('已切到竖封面')
  else log('（未找到「竖封面」选项卡，可能默认就是竖封面或选择器需校准，继续点完成）')
  await page.waitForTimeout(600)
  const done = await clickFirst(page, [selectors.coverDoneBtn], selectors.modalReadyTimeout)
  if (done) log('封面已设置并完成 ✓')
  else log('（封面弹窗未找到「完成/确定」按钮，选择器需校准）')
}

/**
 * 【调试入口】完整跑通「上传 → 填表 →（可选）发布」，给账号列表的调试按钮用。
 * autoSubmit=false（默认）：填好表、传完视频后停下，浏览器窗口保留供人工确认，不真正发布。
 * autoSubmit=true：跑完整闭环并点击发布。
 * 调通后这段逻辑会被搬到发布列表的发布流程里。
 */
export async function debugPostFlow(account, payload = {}, log = () => {}) {
  const { videoPath, title = '', desc = '', topics = [], autoSubmit = false } = payload
  const envDesc = account.id != null ? `环境ID id-${account.id}` : `临时环境 ${account.name}`
  log(`【调试】启动账号「${account.name}」的指纹浏览器（${envDesc}）…`)

  let ctx
  try {
    ctx = await acquireContext(account)
  } catch (err) {
    log(`✗ 指纹浏览器启动失败：${(err && err.message) || err}`)
    throw err
  }
  log('指纹浏览器已打开 ✓')

  const page = ctx.pages()[0] || (await ctx.newPage())
  await page.bringToFront().catch(() => {})

  await uploadAndFill(page, { videoPath, title, desc, topics }, log)

  if (autoSubmit || MOCK) {
    await clickPublish(page, log)
  } else {
    log('✓ 视频已上传、表单已填写。浏览器窗口已保留，请人工核对后手动点「发布」。')
  }
  return { ok: true }
}

/** 等发布按钮可点（视频处理完才会启用）→ 点击 → 等发布成功 */
async function clickPublish(page, log = () => {}) {
  log('等待「发布」按钮可点击（视频处理完成后才会启用）…')
  try {
    // Playwright 的 click 会自动等待元素可见且可点（enabled、稳定），给足超时等编码完成
    await page.click(selectors.publishBtn, { timeout: selectors.uploadTimeout })
    log('已点击发布')
  } catch (e) {
    log(`✗ 点击发布失败：${(e && e.message) || e}`)
    throw e
  }
  await page
    .waitForSelector(selectors.publishSuccess, { timeout: selectors.uploadTimeout })
    .then(() => log('发布成功 ✓'))
    .catch(() => log('（未捕获“发布成功”提示，请在浏览器中确认结果）'))
}

/** 数据库任务版单视频发布（关联后自动发布用） */
export async function publishOne(account, { videoPath, title, topics = [], productId }, log = () => {}) {
  const ctx = await acquireContext(account)
  const page = ctx.pages()[0] || (await ctx.newPage())
  await page.bringToFront().catch(() => {})
  try {
    // 上传页优先流程（上传 → 自动跳转发布页 → 填表）
    await uploadAndFill(page, { videoPath, title, topics }, log)
    if (productId) log(`  待补全：绑定商品 ${productId}`)
    if (MOCK) {
      await page.click(selectors.publishBtn)
      await page.waitForSelector(selectors.publishSuccess, { timeout: selectors.uploadTimeout })
    }
  } catch (err) {
    throw err
  }
  // 不主动关闭：同账号(环境ID)的浏览器保持开启并复用，避免 Profile 占用冲突
}

/**
 * 发布列表「发布」按钮：用对应账号的指纹浏览器进入发布页，上传视频、自动填表。
 * 默认 autoSubmit=false：填好表、传完视频后停下，浏览器保留供人工确认。
 * MOCK 下会跑完整闭环（含假“发布”）并保留窗口。
 */
export async function postVideo(account, payload, log = () => {}) {
  const { videoPath, title, topics = [], productId, productLink, autoSubmit = false } = payload
  const envDesc = account.id != null ? `环境ID id-${account.id}` : `临时环境 ${account.name}`
  log(`启动账号「${account.name}」的指纹浏览器（${envDesc}，携带该 Profile 已保存的登录态）…`)

  let ctx
  try {
    ctx = await acquireContext(account)
  } catch (err) {
    log(`✗ 指纹浏览器启动失败：${(err && err.message) || err}`)
    throw err
  }
  log('指纹浏览器已打开 ✓')

  const page = ctx.pages()[0] || (await ctx.newPage())
  await page.bringToFront().catch(() => {})
  try {
    // 上传页优先流程：打开上传页 → 选本地视频 → 自动跳转发布页 → 填表
    // （之前是直接进 post/video 发布页，现统一改为先进 upload 上传页）
    await uploadAndFill(page, { videoPath, title, topics }, log)

    if (productId || productLink) {
      log(`待补全：绑定商品 ${productId || productLink}（流程/选择器待提供）`)
    }

    if (autoSubmit || MOCK) {
      await clickPublish(page, log)
      if (autoSubmit && !MOCK) await ctx.close()
    } else {
      log('表单已填写、视频已上传 ✓ 浏览器窗口保留，请人工确认后点击发布')
    }
    return { ok: true }
  } catch (err) {
    throw err
  }
}
