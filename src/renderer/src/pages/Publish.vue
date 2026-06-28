<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { toast } from '../toast'

const accounts = ref([])
const picked = ref([])
const dayTotal = ref(2)
const dupDays = ref(0)
const folder = ref('')
const runAuto = ref(false)
const busy = ref(false)

const log = ref([])
const logBox = ref(null)
let offLog = null

const archive = ref({ source: [], success: {}, error: [] })

// 表单单选项（暂为前端配置，后续作为发布参数下传）
const opt = ref({
  autoMatch: '否', schedule: '立即发布', visible: '可见',
  highCommission: '是', genTitle: '是', aiVoice: '否', form: '视频'
})

const fanLimit = (f) => (f > 10000 ? 10 : f >= 3000 ? 5 : f >= 1000 ? 2 : 0)
const loggedAccounts = computed(() => accounts.value.filter((a) => a.logged_in && a.status === '启用'))
const need = computed(() =>
  accounts.value.filter((a) => picked.value.includes(a.id))
    .reduce((s, a) => s + Math.min(dayTotal.value, fanLimit(a.fans)), 0)
)
const successPids = computed(() => Object.keys(archive.value.success))
const successCount = computed(() => successPids.value.reduce((s, p) => s + archive.value.success[p].length, 0))

onMounted(async () => {
  accounts.value = await window.api.listAccounts()
  offLog = window.api.onLog((line) => {
    log.value.push(line)
    nextTick(() => { if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight })
  })
})
onBeforeUnmount(() => { if (offLog) offLog() })

function togglePick(id) {
  picked.value = picked.value.includes(id) ? picked.value.filter((x) => x !== id) : [...picked.value, id]
}
function selAll() {
  const all = loggedAccounts.value.map((a) => a.id)
  picked.value = picked.value.length === all.length ? [] : all
}
function stepN(d) { dayTotal.value = Math.min(10, Math.max(1, dayTotal.value + d)) }
function stepDup(d) { dupDays.value = Math.max(0, dupDays.value + d) }

async function refreshArchive() {
  archive.value = folder.value ? await window.api.listArchive(folder.value) : { source: [], success: {}, error: [] }
}

async function pickFolder() {
  const f = await window.api.pickFolder()
  if (f) { folder.value = f; await refreshArchive() }
}

async function start() {
  if (!folder.value) return toast('请先选择视频文件夹')
  if (!picked.value.length) return toast('请先选择至少一个发布账户')
  busy.value = true
  log.value = []
  try {
    await window.api.runPublish({
      folder: folder.value, accountIds: [...picked.value], dayTotal: dayTotal.value, runAutomation: runAuto.value
    })
    await refreshArchive()
    toast('关联完成，已写入发布列表')
  } finally { busy.value = false }
}
</script>

<template>
  <section>
    <div class="pub-wrap">
      <!-- 左：发布设置表单 -->
      <div class="panel">
        <h3>视频发布设置</h3>
        <div class="form">
          <div class="frow"><label class="rq">发布账户</label>
            <div class="acc-multi">
              <span v-if="!loggedAccounts.length" class="muted small" style="padding:6px">暂无已登录账号，请先在「抖音账号列表」扫码登录</span>
              <span
                v-for="a in loggedAccounts" :key="a.id"
                class="chip" :class="{ sel: picked.includes(a.id) }"
                @click="togglePick(a.id)"
              >{{ a.name }}（粉丝{{ a.fans.toLocaleString() }}·上限{{ fanLimit(a.fans) }}）{{ picked.includes(a.id) ? ' ×' : '' }}</span>
            </div>
            <span class="link" @click="selAll">全选</span>
          </div>

          <div class="frow"><label class="rq">日发布总数</label>
            <div class="stepper"><button @click="stepN(-1)">−</button><input :value="dayTotal" readonly /><button @click="stepN(1)">+</button></div>
            <span class="muted small">按账号粉丝量上限自动封顶（2 / 5 / 10）</span>
          </div>

          <div class="frow"><label class="rq">视频文件夹</label>
            <input type="text" :value="folder" placeholder="请选择本地文件夹" readonly style="width:auto;flex:1" />
            <button class="btn p" @click="pickFolder">选择</button>
          </div>

          <div class="frow"><label>商品映射文件</label><input type="text" placeholder="请选择商品映射文件 (excel)" /><button class="btn p">选择</button></div>

          <div class="frow"><label>自动匹配商品</label>
            <div class="radios"><span v-for="o in ['否', '是']" :key="o" class="ro" :class="{ on: opt.autoMatch === o }" @click="opt.autoMatch = o">{{ o }}</span></div>
          </div>
          <div class="frow"><label class="rq">发布定时设置</label>
            <div class="radios"><span v-for="o in ['立即发布', '定时发布']" :key="o" class="ro" :class="{ on: opt.schedule === o }" @click="opt.schedule = o">{{ o }}</span></div>
          </div>
          <div class="frow"><label class="rq">是否可见</label>
            <div class="radios"><span v-for="o in ['可见', '不可见']" :key="o" class="ro" :class="{ on: opt.visible === o }" @click="opt.visible = o">{{ o }}</span></div>
          </div>
          <div class="frow"><label>默认最高佣金</label>
            <div class="radios"><span v-for="o in ['是', '否']" :key="o" class="ro" :class="{ on: opt.highCommission === o }" @click="opt.highCommission = o">{{ o }}</span></div>
          </div>
          <div class="frow"><label>生成话题标题</label>
            <div class="radios"><span v-for="o in ['是', '否']" :key="o" class="ro" :class="{ on: opt.genTitle === o }" @click="opt.genTitle = o">{{ o }}</span></div>
          </div>
          <div class="frow"><label>添加AI声音</label>
            <div class="radios"><span v-for="o in ['是', '否']" :key="o" class="ro" :class="{ on: opt.aiVoice === o }" @click="opt.aiVoice = o">{{ o }}</span></div>
          </div>
          <div class="frow"><label>发布形式</label>
            <div class="radios"><span v-for="o in ['视频', '图文']" :key="o" class="ro" :class="{ on: opt.form === o }" @click="opt.form = o">{{ o }}</span></div>
          </div>

          <div class="frow"><label class="rq">商品不重复发布</label>
            <div class="stepper"><button @click="stepDup(-1)">−</button><input :value="dupDays" readonly /><button @click="stepDup(1)">+</button></div>
            <span class="muted small">天（默认 0 = 不校验）</span>
          </div>

          <label class="frow" style="justify-content:flex-end;gap:6px">
            <input type="checkbox" v-model="runAuto" /> 关联后立即用 Playwright 自动发布
          </label>

          <button class="btn-pub" :disabled="busy" @click="start">{{ busy ? '处理中…' : '开始上传' }}</button>
        </div>
      </div>

      <!-- 右：发布设置日志 -->
      <div class="panel">
        <h3>发布设置日志</h3>
        <div ref="logBox" class="log">
          <span v-if="!log.length" class="muted">点击「开始上传」后，此处显示按账号逐条处理的发布日志…</span>
          <div v-for="(l, i) in log" :key="i">{{ l }}</div>
        </div>
      </div>
    </div>

    <!-- 本地文件夹归档视图（真实磁盘状态） -->
    <div class="panel">
      <h3>本地文件夹归档视图
        <button class="btn sm" @click="refreshArchive">↻ 刷新</button>
      </h3>
      <div class="hint">关联成功 → <code>success/商品编号/</code>；关联失败 → <code>error/</code>；账号铺满后剩余视频留在源文件夹。<b>发布列表从 success/ 读取后执行真实发布。</b></div>
      <div class="fs-cols">
        <div class="fs-col">
          <div class="fs-head">📂 源文件夹 <span class="muted" style="font-weight:400">{{ folder || '未选择' }}</span><span class="fs-badge">{{ archive.source.length }}</span></div>
          <div class="fs-body">
            <div v-if="!archive.source.length" class="fs-empty">（空）</div>
            <div v-for="v in archive.source" :key="v.name" class="fs-file">{{ v.bad ? '⚠️' : '🎬' }} {{ v.name }}<span v-if="v.bad" class="muted">（无法解析）</span></div>
          </div>
        </div>
        <div class="fs-col">
          <div class="fs-head ok">✅ success/ <span class="fs-badge">{{ successCount }}</span></div>
          <div class="fs-body">
            <div v-if="!successPids.length" class="fs-empty">尚无关联成功的视频</div>
            <div v-for="pid in successPids" :key="pid" class="fs-grp">
              <div class="g-name">📁 {{ pid }}/</div>
              <div v-for="f in archive.success[pid]" :key="f" class="fs-file">🎬 {{ f }}</div>
            </div>
          </div>
        </div>
        <div class="fs-col">
          <div class="fs-head err">⛔ error/ <span class="fs-badge">{{ archive.error.length }}</span></div>
          <div class="fs-body">
            <div v-if="!archive.error.length" class="fs-empty">尚无失败视频</div>
            <div v-for="f in archive.error" :key="f" class="fs-file">⚠️ {{ f }}</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
