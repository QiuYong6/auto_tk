import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { initDb } from './db.js'
import { listVideos, listArchive } from './files.js'
import { runPublish } from './publish.js'
import { generateFingerprint } from './fingerprint.js'
import { closeAllContexts } from './automation.js'

let win = null
let db = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    title: '抖音自动化工具',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function registerIpc() {
  ipcMain.handle('dialog:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('files:listVideos', (_e, folder) => listVideos(folder))
  ipcMain.handle('files:listArchive', (_e, folder) => listArchive(folder))

  ipcMain.handle('accounts:list', () => db.prepare('SELECT * FROM accounts ORDER BY id').all())

  // 把前端表单字段统一成可编辑的列集合
  const editable = (a) => ({
    name: a.name,
    account_type: a.account_type || '发布帐户',
    live_room: a.live_room || '',
    proxy: a.proxy || '',
    note: a.note || '',
    clip_structure: a.clip_structure || '',
    clip_method: a.clip_method || '',
    ad_config: a.ad_config ? 1 : 0,
    roi_weight: Number(a.roi_weight) || 0,
    budget: Number(a.budget) || 0
  })

  ipcMain.handle('accounts:add', (_e, a) => {
    const fp = a.ua ? { ua: a.ua, timezone: a.timezone, locale: a.locale } : generateFingerprint()
    const row = {
      ...editable(a),
      status: a.status || '启用',
      logged_in: 0,
      ua: fp.ua,
      timezone: fp.timezone || 'Asia/Shanghai',
      locale: fp.locale || 'zh-CN'
    }
    const info = db
      .prepare(
        `INSERT INTO accounts
         (name, account_type, live_room, proxy, note, clip_structure, clip_method, ad_config, roi_weight, budget, status, logged_in, ua, timezone, locale)
         VALUES (@name, @account_type, @live_room, @proxy, @note, @clip_structure, @clip_method, @ad_config, @roi_weight, @budget, @status, @logged_in, @ua, @timezone, @locale)`
      )
      .run(row)
    return info.lastInsertRowid
  })

  ipcMain.handle('accounts:update', (_e, a) => {
    db.prepare(
      `UPDATE accounts SET
         name=@name, account_type=@account_type, live_room=@live_room, proxy=@proxy, note=@note,
         clip_structure=@clip_structure, clip_method=@clip_method, ad_config=@ad_config,
         roi_weight=@roi_weight, budget=@budget
       WHERE id=@id`
    ).run({ ...editable(a), id: a.id })
    return true
  })

  ipcMain.handle('accounts:setStatus', (_e, { id, status }) => {
    db.prepare('UPDATE accounts SET status = ? WHERE id = ?').run(status, id)
    return true
  })

  ipcMain.handle('accounts:delete', (_e, id) => {
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('tasks:list', () => db.prepare('SELECT * FROM tasks ORDER BY id DESC').all())

  // 扫码登录：打开该账号独立指纹浏览器 → creator.douyin.com → 检测扫码 → 持久化登录态
  ipcMain.handle('account:login', async (_e, id) => {
    const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id)
    if (!acc) return { ok: false, reason: 'account not found' }
    const { loginAccount } = await import('./automation.js')
    try {
      const r = await loginAccount(acc, (stage) => send('account:status', { id, stage }))
      const info = (r && r.info) || {}
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
      db.prepare(
        `UPDATE accounts SET
           logged_in = 1,
           login_time = ?,
           dy_name = CASE WHEN ? <> '' THEN ? ELSE dy_name END,
           dy_id   = CASE WHEN ? <> '' THEN ? ELSE dy_id END,
           fans    = CASE WHEN ? > 0  THEN ? ELSE fans END,
           avatar  = CASE WHEN ? <> '' THEN ? ELSE avatar END
         WHERE id = ?`
      ).run(
        now,
        info.dy_name || '', info.dy_name || '',
        info.dy_id || '', info.dy_id || '',
        info.fans || 0, info.fans || 0,
        info.avatar || '', info.avatar || '',
        id
      )
      return { ok: true }
    } catch (err) {
      return { ok: false, reason: String((err && err.message) || err) }
    }
  })

  ipcMain.handle('publish:run', async (_e, cfg) => runPublish(cfg, db, (line) => send('publish:log', line)))

  // 发布列表「发布」：用对应账号指纹浏览器进发布页、上传视频、自动填表
  ipcMain.handle('publish:postVideo', async (_e, payload) => {
    const acctName = (payload && payload.account && payload.account.name) || payload.accountName || '?'
    send('publish:log', `收到发布请求：账号「${acctName}」，加载自动化模块…`)
    try {
      const { postVideo } = await import('./automation.js')
      send('publish:log', '自动化模块已加载，准备启动浏览器…')
      await postVideo(payload.account || { name: payload.accountName }, payload, (l) => send('publish:log', l))
      return { ok: true }
    } catch (err) {
      const detail = String((err && err.stack) || (err && err.message) || err)
      send('publish:log', `✗ 发布失败：${detail}`)
      return { ok: false, reason: String((err && err.message) || err) }
    }
  })

  // 【调试】账号列表「调试发布」按钮：完整跑通 上传 → 填表 →（可选）发布
  ipcMain.handle('debug:postFlow', async (_e, payload) => {
    const acc = payload && payload.account
    if (!acc) return { ok: false, reason: '缺少账号信息' }
    send('publish:log', `▶ 调试发布：账号「${acc.name}」，加载自动化模块…`)
    try {
      const { debugPostFlow } = await import('./automation.js')
      await debugPostFlow(acc, payload, (l) => send('publish:log', l))
      return { ok: true }
    } catch (err) {
      const detail = String((err && err.stack) || (err && err.message) || err)
      send('publish:log', `✗ 调试发布失败：${detail}`)
      return { ok: false, reason: String((err && err.message) || err) }
    }
  })

  // 数据库任务版单条发布
  ipcMain.handle('publish:runTask', async (_e, taskId) => {
    const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId)
    if (!t) return { ok: false, reason: 'task not found' }
    const { publishOne } = await import('./automation.js')
    db.prepare("UPDATE tasks SET status='ing', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(taskId)
    send('publish:log', `▶ 发布任务 #${t.id}（${t.account_name} · ${t.file}）…`)
    try {
      const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(t.account_id)
      await publishOne(
        acc,
        { videoPath: t.src_path, productId: t.product_id, title: t.product_id, topics: [] },
        (l) => send('publish:log', l)
      )
      db.prepare("UPDATE tasks SET status='done', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(taskId)
      send('publish:log', `✓ 任务 #${t.id} 发布成功`)
      return { ok: true }
    } catch (err) {
      const reason = String((err && err.message) || err)
      db.prepare("UPDATE tasks SET status='fail', reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(reason, taskId)
      send('publish:log', `✗ 任务 #${t.id} 发布失败：${reason}`)
      return { ok: false, reason }
    }
  })
}

app.whenReady().then(() => {
  db = initDb()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 退出前先关掉所有 Playwright 浏览器，避免残留 chrome.exe 进程锁住安装目录
// （否则 Windows 覆盖安装/卸载会报「无法关闭 / Failed to uninstall old application files」）。
let _cleaningUp = false
app.on('before-quit', (e) => {
  if (_cleaningUp) return
  e.preventDefault()
  _cleaningUp = true
  Promise.race([
    closeAllContexts(),
    new Promise((r) => setTimeout(r, 5000)) // 兜底：最多等 5 秒，避免卡住退出
  ]).finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
