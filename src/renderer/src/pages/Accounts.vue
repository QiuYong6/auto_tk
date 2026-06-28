<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { toast } from '../toast'

const accounts = ref([])

// 新增 / 编辑 弹窗
const showForm = ref(false)
const editMode = ref(false)
const blank = () => ({
  id: null, name: '', account_type: '发布帐户', live_room: '', proxy: '', note: '',
  clip_structure: '', clip_method: '', ad_config: 1, roi_weight: 1.0, budget: 500
})
const form = reactive(blank())

// 查看登录信息 / 指纹 弹窗
const showInfo = ref(false)
const infoAcc = ref(null)

// 扫码登录 弹窗
const showLogin = ref(false)
const login = reactive({ id: null, name: '', stage: '', error: '' })
let offStatus = null
const stageText = {
  opening: '正在打开该账号的独立指纹浏览器…',
  waiting_scan: '浏览器已打开 — 请在弹出的窗口扫码登录（MOCK 下点页面里的「模拟扫码登录成功」）',
  logged_in: '检测到登录，正在保存登录态与登录信息…'
}

// 调试发布 弹窗（操作列「调试发布」按钮触发；调通后逻辑会搬进发布列表）
const DEFAULT_DEBUG_VIDEO = '/Users/zisu/work_space/22/20260410_114122.mp4'
const showDebug = ref(false)
const debug = reactive({
  id: null, name: '', videoPath: DEFAULT_DEBUG_VIDEO,
  title: '测试发布标题', desc: '', autoSubmit: false, running: false
})
const debugLogs = ref([])
let offLog = null

async function load() { accounts.value = await window.api.listAccounts() }
onMounted(() => {
  load()
  offStatus = window.api.onAccountStatus(({ id, stage }) => { if (id === login.id) login.stage = stage })
  // 订阅主进程日志，调试弹窗打开时实时展示
  offLog = window.api.onLog((line) => {
    if (!showDebug.value) return
    debugLogs.value.push(line)
    if (debugLogs.value.length > 500) debugLogs.value.shift()
  })
})
onBeforeUnmount(() => { if (offStatus) offStatus(); if (offLog) offLog() })

const fanLimit = (f) => (f > 10000 ? 10 : f >= 3000 ? 5 : f >= 1000 ? 2 : 0)

// 新增 / 编辑
function openAdd() { Object.assign(form, blank()); editMode.value = false; showForm.value = true }
function openEdit(a) {
  Object.assign(form, blank(), {
    id: a.id, name: a.name, account_type: a.account_type || '发布帐户', live_room: a.live_room || '',
    proxy: a.proxy || '', note: a.note || '', clip_structure: a.clip_structure || '', clip_method: a.clip_method || '',
    ad_config: a.ad_config ? 1 : 0, roi_weight: a.roi_weight ?? 1, budget: a.budget ?? 0
  })
  editMode.value = true; showForm.value = true
}
function formatStructure() {
  try { form.clip_structure = JSON.stringify(JSON.parse(form.clip_structure || 'null'), null, 2) }
  catch { toast('成片结构不是合法 JSON') }
}
function stepRoi(d) { form.roi_weight = Math.max(0, Math.round((Number(form.roi_weight) + d) * 100) / 100) }
function stepBudget(d) { form.budget = Math.max(0, Number(form.budget) + d) }
async function submitForm() {
  if (!form.name.trim()) return toast('请填写名称')
  const payload = { ...form, name: form.name.trim() }
  if (editMode.value) await window.api.updateAccount(payload)
  else await window.api.addAccount(payload)
  toast(editMode.value ? '已保存' : '账号已新增')
  showForm.value = false
  await load()
}

// 启用 / 禁用
async function toggleStatus(a) {
  const next = a.status === '启用' ? '禁用' : '启用'
  await window.api.setAccountStatus(a.id, next)
  toast(`已${next}`)
  await load()
}

// 删除
async function del(a) {
  if (!confirm(`确定删除账号「${a.name}」？`)) return
  await window.api.deleteAccount(a.id)
  toast('已删除')
  await load()
}

// 查看登录信息 / 指纹
function openInfo(a) { infoAcc.value = a; showInfo.value = true }

// 扫码登录
async function doLogin(a) {
  login.id = a.id; login.name = a.name; login.stage = 'opening'; login.error = ''
  showLogin.value = true
  try {
    const res = await window.api.loginAccount(a.id)
    if (res.ok) { login.stage = 'success'; await load() }
    else { login.stage = 'error'; login.error = res.reason }
  } catch (e) { login.stage = 'error'; login.error = String(e) }
}
function closeLogin() { showLogin.value = false; login.id = null }

// 调试发布
function openDebug(a) {
  debug.id = a.id; debug.name = a.name
  debug.videoPath = DEFAULT_DEBUG_VIDEO
  debug.title = '测试发布标题'; debug.desc = ''
  debug.autoSubmit = false; debug.running = false
  debugLogs.value = []
  showDebug.value = true
}
async function runDebug() {
  if (debug.running) return
  if (!debug.videoPath.trim()) return toast('请填写视频文件路径')
  const acc = accounts.value.find((x) => x.id === debug.id)
  if (!acc) return toast('账号不存在')
  debug.running = true
  debugLogs.value.push(`—— 开始调试（${debug.autoSubmit ? '自动发布' : '仅填表，不发布'}）——`)
  try {
    // 注意：acc 是 Vue 响应式 Proxy，直接走 IPC 会报「An object could not be cloned」，
    // 必须转成纯对象再传。
    const plainAcc = JSON.parse(JSON.stringify(acc))
    const res = await window.api.debugPostFlow({
      account: plainAcc,
      videoPath: debug.videoPath.trim(),
      title: debug.title,
      desc: debug.desc,
      autoSubmit: debug.autoSubmit
    })
    if (res.ok) { debugLogs.value.push('—— 调试结束 ——'); toast('调试流程已执行完') }
    else { debugLogs.value.push(`✗ 失败：${res.reason}`); toast('调试失败') }
  } catch (e) {
    debugLogs.value.push(`✗ 异常：${String(e)}`)
  } finally {
    debug.running = false
  }
}
function closeDebug() { if (debug.running) return; showDebug.value = false }
</script>

<template>
  <section>
    <div class="panel" style="padding:14px 16px;margin-bottom:14px">
      <div class="filters">
        <span class="fl"><label>搜索</label><input type="text" placeholder="搜索账号" /></span>
        <span class="fl"><label>状态</label><select><option>全部</option><option>启用</option><option>禁用</option></select></span>
        <span class="fl"><label>抖音登录</label><select><option>全部</option><option>已登录</option><option>未登录</option></select></span>
        <button class="btn p">🔍 搜索</button>
      </div>
    </div>

    <div class="toolbar">
      <button class="btn p" @click="openAdd">+ 新增账号</button>
      <button class="btn" @click="load">刷新</button>
    </div>

    <div class="panel" style="padding:0">
      <div style="overflow:auto">
        <table>
          <thead>
            <tr>
              <th>序号</th><th>头像</th><th>账号信息</th><th>备注</th>
              <th>状态</th><th>登录状态</th><th>关键时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(a, i) in accounts" :key="a.id">
              <td>{{ i + 1 }}</td>
              <td>
                <div class="acc-head"><span class="tav"></span>
                  <div><b>{{ a.name }}</b>
                    <div class="muted" style="font-size:12px;margin-top:2px">上限 {{ fanLimit(a.fans) }}</div>
                  </div>
                </div>
              </td>
              <td>
                <div class="muted" style="font-size:12.5px;line-height:1.7">
                  抖音平台 · {{ a.dy_name || '未登录' }}<br />ID：{{ a.dy_id || '—' }}<br />粉丝数：{{ a.fans ? a.fans.toLocaleString() : '—' }}
                </div>
              </td>
              <td style="white-space:normal;max-width:180px">{{ a.note || '—' }}</td>
              <td><span class="tag" :class="a.status === '启用' ? 't-on' : 't-off'">{{ a.status }}</span></td>
              <td><span class="tag clickable" :class="a.logged_in ? 't-on' : 't-off'" title="点击打开指纹浏览器（登录 / 校验登录态）" @click="doLogin(a)">{{ a.logged_in ? '已登录' : '未登录' }}</span></td>
              <td><div class="ktime"><span>📅 创建：{{ (a.created_at || '').slice(0, 16) || '—' }}</span><span v-if="a.login_time">🕐 登录：{{ a.login_time.slice(0, 16) }}</span></div></td>
              <td>
                <span class="btn-link" @click="openEdit(a)">编辑</span>
                <span class="btn-link" @click="toggleStatus(a)">{{ a.status === '启用' ? '禁用' : '启用' }}</span>
                <span class="btn-link" @click="openInfo(a)">查看登录信息</span>
                <span class="btn-link debug" @click="openDebug(a)">调试发布</span>
                <span class="btn-link red" @click="del(a)">删除</span>
              </td>
            </tr>
            <tr v-if="!accounts.length"><td colspan="8"><div class="empty">暂无账号</div></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 新增 / 编辑 弹窗 -->
    <div v-if="showForm" class="mask">
      <div class="modal wide">
        <div class="mh"><span>{{ editMode ? '编辑' : '新增账号' }}</span><span class="x" @click="showForm = false">×</span></div>
        <div class="mb dlg">
          <div class="sec-title">基本信息</div>
          <div class="grid2">
            <div class="fcol"><label class="rq">名称</label><input type="text" v-model="form.name" placeholder="如 阳-熙园百货（109）" /></div>
            <div class="fcol"><label class="rq">帐户类型</label>
              <select v-model="form.account_type"><option>发布帐户</option><option>投流帐户</option></select>
            </div>
            <div class="fcol"><label>直播间</label><select v-model="form.live_room"><option value="">请选择直播间</option><option>直播间A</option></select></div>
            <div class="fcol"><label>代理IP</label><input type="text" v-model="form.proxy" placeholder="http://用户名:密码@ip:端口" /></div>
            <div class="fcol span2"><label>备注</label><textarea v-model="form.note" rows="2" placeholder="请输入内容"></textarea></div>
          </div>

          <div class="sec-title">发布设置</div>
          <div class="fcol span2"><label>成片结构</label>
            <textarea v-model="form.clip_structure" rows="5" placeholder="null"></textarea>
            <div><button class="btn p sm" style="margin-top:8px" @click="formatStructure">格式化</button></div>
          </div>
          <div class="grid2" style="margin-top:14px">
            <div class="fcol"><label>成片方式</label><select v-model="form.clip_method"><option value="">请选择</option><option>方式A</option><option>方式B</option></select></div>
            <div class="fcol"><label>投流参数</label>
              <div class="radios">
                <span class="ro" :class="{ on: form.ad_config === 0 }" @click="form.ad_config = 0">不配置</span>
                <span class="ro" :class="{ on: form.ad_config === 1 }" @click="form.ad_config = 1">配置</span>
              </div>
            </div>
            <div class="fcol"><label>ROI权重</label>
              <div class="stepper"><button @click="stepRoi(-0.01)">−</button><input :value="form.roi_weight" readonly /><button @click="stepRoi(0.01)">+</button></div>
              <div class="muted small" style="margin-top:4px">(1/0.9/签收率)</div>
            </div>
            <div class="fcol"><label>预算金额</label>
              <div class="stepper"><button @click="stepBudget(-50)">−</button><input :value="form.budget" readonly /><button @click="stepBudget(50)">+</button></div>
            </div>
          </div>

          <div class="dlg-foot">
            <button class="btn" @click="showForm = false">取消</button>
            <button class="btn p" @click="submitForm">确定</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 查看登录信息 / 指纹 弹窗 -->
    <div v-if="showInfo" class="mask">
      <div class="modal wide">
        <div class="mh"><span>登录信息 &amp; 指纹 · {{ infoAcc?.name }}</span><span class="x" @click="showInfo = false">×</span></div>
        <div class="mb dlg" style="text-align:left">
          <div class="sec-title">登录信息（扫码后抓取）</div>
          <div v-if="!infoAcc?.logged_in" class="muted" style="padding:8px 0">该账号未登录，扫码登录后这里会显示抓取到的抖音资料。</div>
          <div v-else class="kvtable">
            <div><span class="k">抖音名称</span><span>{{ infoAcc.dy_name || '—' }}</span></div>
            <div><span class="k">抖音 ID</span><span>{{ infoAcc.dy_id || '—' }}</span></div>
            <div><span class="k">粉丝数</span><span>{{ infoAcc.fans ? infoAcc.fans.toLocaleString() : '—' }}</span></div>
            <div><span class="k">登录时间</span><span>{{ infoAcc.login_time || '—' }}</span></div>
          </div>

          <div class="sec-title" style="margin-top:18px">指纹 / 虚拟设备</div>
          <div class="kvtable">
            <div><span class="k">环境ID</span><span>account-{{ infoAcc?.id }}</span></div>
            <div><span class="k">User-Agent</span><span style="word-break:break-all">{{ infoAcc?.ua || '—' }}</span></div>
            <div><span class="k">时区</span><span>{{ infoAcc?.timezone || 'Asia/Shanghai' }}</span></div>
            <div><span class="k">语言</span><span>{{ infoAcc?.locale || 'zh-CN' }}</span></div>
            <div><span class="k">代理IP</span><span>{{ infoAcc?.proxy || '（未配置，使用本机网络）' }}</span></div>
          </div>
          <div class="dlg-foot"><button class="btn p" @click="showInfo = false">关闭</button></div>
        </div>
      </div>
    </div>

    <!-- 扫码登录 弹窗 -->
    <div v-if="showLogin" class="mask">
      <div class="modal">
        <div class="mh"><span>扫码登录 · {{ login.name }}</span><span class="x" @click="closeLogin">×</span></div>
        <div class="mb">
          <template v-if="login.stage === 'success'">
            <div class="ok-mark">✓</div>
            <div style="font-weight:600">登录成功</div>
            <div class="muted" style="font-size:12.5px;margin-top:8px">登录信息已抓取并保存，可点该行「查看登录信息」查看</div>
            <div style="margin-top:16px"><button class="btn p" @click="closeLogin">完成</button></div>
          </template>
          <template v-else-if="login.stage === 'error'">
            <div style="font-size:34px">⚠️</div>
            <div style="font-weight:600;margin-top:6px">登录未完成</div>
            <div class="muted" style="font-size:12.5px;margin-top:8px">{{ login.error }}</div>
            <div style="margin-top:16px"><button class="btn" @click="closeLogin">关闭</button></div>
          </template>
          <template v-else>
            <div class="spin"></div>
            <div style="font-weight:600;margin-top:6px">{{ stageText[login.stage] || '处理中…' }}</div>
            <div class="muted" style="font-size:12px;margin-top:10px">二维码在弹出的浏览器窗口中，不在此处</div>
          </template>
        </div>
      </div>
    </div>

    <!-- 调试发布 弹窗 -->
    <div v-if="showDebug" class="mask">
      <div class="modal wide">
        <div class="mh"><span>调试发布 · {{ debug.name }}</span><span class="x" @click="closeDebug">×</span></div>
        <div class="mb dlg" style="text-align:left">
          <div class="muted" style="font-size:12.5px;margin-bottom:12px">
            流程：打开上传页 → 选本地视频 → 自动跳转发布页 → 填写标题/简介 → 自主声明选「无需添加」→ 封面设为竖封面并完成 → 等上传完成 →（可选）点击发布。<br />
            未勾选「自动发布」时只填表/封面/声明、不真正发布，浏览器窗口保留供人工核对。封面与自主声明弹窗的选择器可能需对照日志在 selectors.json 校准。
          </div>
          <div class="fcol" style="margin-bottom:12px">
            <label>视频文件路径</label>
            <input type="text" v-model="debug.videoPath" placeholder="/绝对路径/视频.mp4" />
          </div>
          <div class="fcol" style="margin-bottom:12px">
            <label>标题</label>
            <input type="text" v-model="debug.title" placeholder="作品标题" />
          </div>
          <div class="fcol" style="margin-bottom:12px">
            <label>简介（可选）</label>
            <textarea v-model="debug.desc" rows="2" placeholder="作品简介，可含 #话题"></textarea>
          </div>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
            <input type="checkbox" v-model="debug.autoSubmit" />
            自动点击发布（关闭则填完表停下，人工确认后再发）
          </label>

          <div class="sec-title" style="margin-top:16px">运行日志</div>
          <div class="logbox">
            <div v-for="(l, i) in debugLogs" :key="i" class="logline">{{ l }}</div>
            <div v-if="!debugLogs.length" class="muted" style="padding:6px">点「开始调试」后这里显示实时日志…</div>
          </div>

          <div class="dlg-foot">
            <button class="btn" @click="closeDebug" :disabled="debug.running">关闭</button>
            <button class="btn p" @click="runDebug" :disabled="debug.running">{{ debug.running ? '运行中…' : '开始调试' }}</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.modal.wide { width: 600px; max-width: 92vw; }
.dlg { text-align: left; max-height: 72vh; overflow: auto; }
.sec-title { font-weight: 700; border-left: 3px solid var(--accent); padding-left: 8px; margin: 6px 0 12px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.fcol { display: flex; flex-direction: column; gap: 6px; }
.fcol.span2 { grid-column: 1 / 3; }
.fcol > label { font-size: 13px; color: var(--muted); }
.fcol > label.rq::before { content: '*'; color: var(--err); margin-right: 3px; }
.fcol input[type=text], .fcol select, .fcol textarea { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 13px; font-family: inherit; }
.dlg-foot { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.kvtable { display: flex; flex-direction: column; gap: 10px; }
.kvtable > div { display: flex; gap: 12px; }
.kvtable .k { width: 96px; flex-shrink: 0; color: var(--muted); }
.tag.clickable { cursor: pointer; }
.tag.clickable:hover { outline: 1px solid var(--accent); }
.btn-link.debug { color: #7c3aed; }
.logbox { background: #0f172a; color: #d1d5db; border-radius: 8px; padding: 10px 12px; height: 220px; overflow: auto; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.6; }
.logline { white-space: pre-wrap; word-break: break-all; }
</style>
