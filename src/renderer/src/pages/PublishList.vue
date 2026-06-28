<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { toast } from '../toast'
import { go } from '../nav'

const tabs = [
  ['all', '全部'], ['make', '待制作'], ['vaudit', '待视频审核'], ['vsplit', '待视频切分'],
  ['iaudit', '待信息审核'], ['edit', '待成片剪辑'], ['eaudit', '待成片剪辑审核'], ['draft', '草稿'],
  ['wait', '待发布'], ['ing', '发布中'], ['done', '已发布'], ['fail', '发布失败']
]
const curTab = ref('wait')

// 写死数据（对照真实系统发布列表布局）
const rows = ref([
  {
    no: 1, status: 'wait',
    title: '【7·99抢】不锈钢保鲜盒厨房家用带盖防漏冰箱收纳盒冻肉收纳冷冻',
    topics: ['不锈钢保鲜盒', '厨房家用', '带盖防漏', '冰箱收纳盒', '冻肉收纳'],
    coverTitle: '未知封面', code: '2070834203364298752',
    productLink: 'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3822623597122420773&origin_type=pc_buyin_selection_decision',
    productId: '3822623597122420773', liveRoom: '', account: '胡403—一帆风顺',
    productName: '【7·99抢】不锈钢保鲜盒厨房家用带盖防漏冰箱收纳盒冻肉收纳冷冻',
    productShort: '视频同款',
    videoFile: 'E:\\wxw选品+作品\\抖音成品\\20260628\\success\\3822623597122420773\\3822623597122420773.mp4',
    preset: '2026-06-28 06:00:00', created: '2026-06-27 19:38:42', updated: '2026-06-27 19:38:42'
  },
  {
    no: 2, status: 'wait',
    title: '魔术扫把第四代刮水扫地拖地神器家用干湿两用地刮',
    topics: ['魔术扫把', '第四代', '刮水扫把', '干湿两用', '地刮'],
    coverTitle: '未知封面', code: '2070834187321085952',
    productLink: 'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3821856393439346889&origin_type=pc_buyin_selection_decision',
    productId: '3821856393439346889', liveRoom: '', account: '胡403—一帆风顺',
    productName: '魔术扫把第四代刮水扫地拖地神器家用干湿两用地刮',
    productShort: '视频同款',
    videoFile: 'E:\\wxw选品+作品\\抖音成品\\20260628\\success\\3821856393439346889\\3821856393439346889.mp4',
    preset: '2026-06-28 06:00:00', created: '2026-06-27 19:38:39', updated: '2026-06-27 19:38:39'
  },
  {
    no: 3, status: 'wait',
    title: '【加厚款】一次性手套食品级专用家用厨房洗碗加厚耐用pe薄膜手套',
    topics: ['一次性手套', '食品级', '加厚耐用', '厨房洗碗', 'pe手套'],
    coverTitle: '未知封面', code: '2070834099812345678',
    productLink: 'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3820011223344556677&origin_type=pc_buyin_selection_decision',
    productId: '3820011223344556677', liveRoom: '', account: '胡403—一帆风顺',
    productName: '【加厚款】一次性手套食品级专用家用厨房洗碗加厚耐用pe薄膜手套',
    productShort: '视频同款',
    videoFile: 'E:\\wxw选品+作品\\抖音成品\\20260628\\success\\3820011223344556677\\3820011223344556677.mp4',
    preset: '2026-06-28 06:00:00', created: '2026-06-27 19:38:35', updated: '2026-06-27 19:38:35'
  },
  {
    no: 4, status: 'wait',
    title: '【子苏严选】便携榨汁杯无线充电小型家用果汁机随行杯',
    topics: ['便携榨汁杯', '无线充电', '家用果汁机', '随行杯', '子苏严选'],
    coverTitle: '未知封面', code: '2070834300011223344',
    productLink: 'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3823001122334455667&origin_type=pc_buyin_selection_decision',
    productId: '3823001122334455667', liveRoom: '', account: '子苏',
    productName: '【子苏严选】便携榨汁杯无线充电小型家用果汁机随行杯',
    productShort: '视频同款',
    videoFile: 'E:\\wxw选品+作品\\抖音成品\\20260628\\success\\3823001122334455667\\3823001122334455667.mp4',
    preset: '2026-06-28 06:00:00', created: '2026-06-27 19:40:02', updated: '2026-06-27 19:40:02'
  }
])

const busyNo = ref(null)
const log = ref([])
const showLog = ref(false)
const logBox = ref(null)
const accounts = ref([])
let offLog = null

onMounted(() => {
  window.api.listAccounts().then((a) => { accounts.value = a })
  offLog = window.api.onLog((line) => {
    log.value.push(line)
    nextTick(() => { if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight })
  })
})
onBeforeUnmount(() => { if (offLog) offLog() })

const counts = computed(() => {
  const c = {}
  tabs.forEach(([k]) => (c[k] = 0))
  c.all = rows.value.length
  rows.value.forEach((r) => { if (c[r.status] !== undefined) c[r.status]++ })
  return c
})
const shown = computed(() => (curTab.value === 'all' ? rows.value : rows.value.filter((r) => r.status === curTab.value)))

async function publish(r) {
  busyNo.value = r.no
  showLog.value = true
  log.value = [`▶ 点击发布：账号「${r.account}」，调用 postVideo…`]

  // 兜底：preload 没生效时给出明确提示（而不是静默失败）
  if (!window.api || typeof window.api.postVideo !== 'function') {
    log.value.push('✗ window.api.postVideo 不存在 —— preload 未生效。请完全退出 App（Cmd+Q）后重新运行 npm run dev:mock')
    busyNo.value = null
    return
  }

  // 把发布列表的账号名映射到「账号列表」里的真实账号，带上 id → 复用该账号已登录的 Profile
  const acc = accounts.value.find((a) => a.name === r.account)
  if (!acc) {
    toast(`账号「${r.account}」不在账号列表，请先到「抖音账号列表」新增并扫码登录`)
    log.value.push(`⚠️ 账号「${r.account}」不在账号列表，将用临时环境打开（无登录态）`)
  } else if (!acc.logged_in) {
    toast(`账号「${r.account}」未登录，请先在「账号列表」扫码登录`)
    log.value.push(`⚠️ 账号「${r.account}」未登录，浏览器会停在登录页`)
  }
  const account = acc
    ? { id: acc.id, name: acc.name, ua: acc.ua, proxy: acc.proxy, timezone: acc.timezone, locale: acc.locale }
    : { name: r.account }

  toast(`正在用账号「${r.account}」打开指纹浏览器…`)
  log.value.push('已调用 window.api.postVideo，等待主进程响应…')
  try {
    // 关键：Vue 响应式对象/数组是 Proxy，不能直接过 IPC（结构化克隆会报
    // "An object could not be cloned"）。先深拷贝成纯对象再发。
    const payload = JSON.parse(JSON.stringify({
      account,
      videoPath: r.videoFile,
      title: r.title,
      topics: r.topics,
      productId: r.productId,
      productLink: r.productLink,
      autoSubmit: false
    }))
    const res = await window.api.postVideo(payload)
    if (res && res.ok) { r.status = 'ing'; toast(`#${r.no} 已打开发布页并上传，请在浏览器确认`) }
    else { log.value.push(`✗ 返回失败：${res && res.reason}`); toast(`#${r.no}：${res && res.reason}`) }
  } catch (e) {
    // 关键：把之前被吞掉的异常打出来（如「No handler registered」「不是函数」等）
    log.value.push(`✗ 调用 postVideo 异常：${(e && e.message) || e}`)
    toast(`发布调用失败：${(e && e.message) || e}`)
  } finally {
    busyNo.value = null
  }
}

function discard(r) {
  rows.value = rows.value.filter((x) => x.no !== r.no)
  toast(`任务 #${r.no} 已作废`)
}
</script>

<template>
  <section class="pl">
    <!-- 筛选条 -->
    <div class="panel filters-panel">
      <div class="frow2">
        <span class="fl"><label>标题/主题/商品(ID)(短)标题</label><input type="text" placeholder="请输入" /></span>
        <span class="fl"><label>发布帐户</label><select><option>请选择</option><option>胡403—一帆风顺</option></select></span>
        <span class="fl"><label>直播间</label><select><option>请选择直播间</option></select></span>
        <span class="fl"><label>切片视频ID</label><input type="text" placeholder="请输入" /></span>
      </div>
      <div class="frow2">
        <span class="fl"><label>发布时间</label><input type="text" placeholder="开始时间" /><i>~</i><input type="text" placeholder="结束时间" /></span>
        <span class="fl"><label>创建时间</label><input type="text" value="2026-06-27 00:00:00" /><i>~</i><input type="text" placeholder="结束时间" /></span>
        <button class="btn p">🔍 搜索</button>
      </div>
    </div>

    <!-- 状态标签 -->
    <div class="tabs">
      <div v-for="[k, label] in tabs" :key="k" class="tab" :class="{ active: curTab === k }" @click="curTab = k">
        {{ label }}<span v-if="counts[k]" class="cnt">{{ counts[k] }}</span>
      </div>
    </div>

    <!-- 列表 -->
    <div class="panel" style="padding:0">
      <div class="pl-head">
        <div class="c-no">序号</div><div class="c-cover">封面</div>
        <div class="c-info">发布信息</div><div class="c-time">时间</div><div class="c-op">操作</div>
      </div>

      <div v-if="!shown.length" class="empty">暂无数据</div>

      <div v-for="r in shown" :key="r.no" class="pl-row">
        <div class="c-no">{{ r.no }}</div>
        <div class="c-cover"><div class="cover-ph">🖼<br />图片加载失败</div></div>
        <div class="c-info">
          <div class="kv"><span class="k">标题</span><span class="v strong">{{ r.title }}</span></div>
          <div class="kv"><span class="k">主题</span><span class="v topics">{{ r.topics.map(t => '#' + t).join(' ') }}</span></div>
          <div class="kv2">
            <span><span class="k">封面标题</span><span class="v">{{ r.coverTitle }}</span></span>
            <span><span class="k">编号</span><span class="v">{{ r.code }}</span></span>
          </div>
          <div class="kv"><span class="k">产品链接</span><span class="v link-text">{{ r.productLink }}</span></div>
          <div class="kv2">
            <span><span class="k">任务状态</span><span class="tag t-wait">待发布</span></span>
            <span><span class="k">产品编号</span><span class="v">{{ r.productId }}</span></span>
          </div>
          <div class="kv2">
            <span><span class="k">直播间</span><span class="v muted">{{ r.liveRoom || '—' }}</span></span>
            <span><span class="k">发布帐户</span><span class="v">{{ r.account }}</span></span>
          </div>
          <div class="kv2">
            <span><span class="k">产品名称</span><span class="v">{{ r.productName }}</span></span>
            <span><span class="k">产品短名称</span><span class="v">{{ r.productShort }}</span></span>
          </div>
          <div class="kv"><span class="k">视频文件</span><span class="v file">{{ r.videoFile }} ▶</span></div>
        </div>
        <div class="c-time">
          <div class="kv"><span class="k">方式</span><span class="v tag t-ing" style="opacity:.5">　</span></div>
          <div class="kv"><span class="k">预设</span><span class="v">{{ r.preset }}</span></div>
          <div class="kv"><span class="k">创建</span><span class="v">{{ r.created }}</span></div>
          <div class="kv"><span class="k">更新</span><span class="v">{{ r.updated }}</span></div>
        </div>
        <div class="c-op">
          <button class="op-link green" :disabled="busyNo === r.no" @click="publish(r)">
            {{ busyNo === r.no ? '打开中…' : '↗ 发布' }}
          </button>
          <button class="op-link red" @click="discard(r)">▣ 任务作废</button>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div class="pager">
      <span class="muted">共 84 条</span>
      <select><option>10条/页</option><option>20条/页</option></select>
      <span class="pages">
        <a>‹</a><a class="on">1</a><a>2</a><a>3</a><a>4</a><a>5</a><a>6</a><a>…</a><a>9</a><a>›</a>
      </span>
    </div>

    <!-- 自动化日志抽屉 -->
    <div v-if="showLog" class="log-drawer">
      <div class="ld-head">发布自动化日志 <span class="x" @click="showLog = false">×</span></div>
      <div ref="logBox" class="log" style="height:200px">
        <div v-for="(l, i) in log" :key="i">{{ l }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.filters-panel { padding:14px 16px; margin-bottom:14px; }
.frow2 { display:flex; gap:18px; align-items:center; flex-wrap:wrap; margin-bottom:10px; }
.frow2:last-child { margin-bottom:0; }
.fl { display:flex; align-items:center; gap:7px; }
.fl label { color:var(--muted); font-size:13px; white-space:nowrap; }
.fl input[type=text] { width:150px; }
.fl i { color:var(--muted); font-style:normal; }

.tabs { flex-wrap:wrap; }

.pl-head, .pl-row { display:grid; grid-template-columns:56px 110px 1fr 230px 110px; }
.pl-head { background:#fafbfd; border-bottom:1px solid var(--line); font-weight:600; color:var(--muted); font-size:13px; }
.pl-head > div { padding:11px 12px; }
.pl-row { border-bottom:1px solid var(--line); font-size:12.5px; }
.pl-row > div { padding:14px 12px; }
.c-no { color:var(--muted); }
.cover-ph { width:78px; height:78px; border:1px dashed var(--line); border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--muted); font-size:11px; text-align:center; line-height:1.5; }

.c-info .kv { display:flex; gap:8px; margin-bottom:7px; }
.c-info .kv2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:7px; }
.c-info .kv2 > span { display:flex; gap:8px; min-width:0; }
.k { color:var(--muted); flex-shrink:0; }
.v { color:var(--text); word-break:break-all; }
.v.strong { font-weight:600; }
.v.topics { color:var(--info); }
.v.link-text { color:var(--info); word-break:break-all; }
.v.file { color:#3a4256; font-family:"SF Mono",Consolas,monospace; }

.c-time .kv { display:flex; gap:8px; margin-bottom:9px; }

.c-op { display:flex; flex-direction:column; gap:12px; align-items:flex-start; }
.op-link { border:none; background:none; cursor:pointer; font-size:13px; padding:0; }
.op-link.green { color:var(--ok); }
.op-link.red { color:var(--err); }
.op-link:disabled { opacity:.5; cursor:default; }

.empty { text-align:center; color:var(--muted); padding:40px; }

.pager { display:flex; align-items:center; gap:14px; padding:14px 4px; }
.pager .pages a { display:inline-block; min-width:28px; height:28px; line-height:28px; text-align:center; border:1px solid var(--line); border-radius:6px; margin:0 3px; cursor:pointer; color:var(--text); }
.pager .pages a.on { background:var(--accent); color:#fff; border-color:var(--accent); }

.log-drawer { position:fixed; right:18px; bottom:18px; width:460px; background:#fff; border:1px solid var(--line); border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,.18); z-index:40; }
.ld-head { padding:10px 14px; border-bottom:1px solid var(--line); font-weight:600; display:flex; justify-content:space-between; }
.ld-head .x { cursor:pointer; color:var(--muted); }
</style>
