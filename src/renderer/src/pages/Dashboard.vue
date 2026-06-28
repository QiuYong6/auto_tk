<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Chart from 'chart.js/auto'

// 注：大屏统计为演示数据，后续接 tasks 聚合查询替换
const dim = {
  week: { labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] },
  month: { labels: ['第1周', '第2周', '第3周', '第4周'] },
  half: { labels: ['1月', '2月', '3月', '4月', '5月', '6月'] },
  year: { labels: ['Q1', 'Q2', 'Q3', 'Q4'] }
}
const dims = [['year', '年'], ['half', '半年'], ['month', '月'], ['week', '周']]

const dUser = ref('month')
const dAcc = ref('month')
const userCanvas = ref(null)
const accCanvas = ref(null)
let chUser = null
let chAcc = null

const rnd = (n, min, max) => Array.from({ length: n }, () => Math.floor(Math.random() * (max - min) + min))

function drawUser() {
  const L = dim[dUser.value].labels
  if (chUser) chUser.destroy()
  chUser = new Chart(userCanvas.value, {
    type: 'bar',
    data: {
      labels: L,
      datasets: [
        { label: '子苏', data: rnd(L.length, 20, 90), backgroundColor: '#fe2c55' },
        { label: '小林', data: rnd(L.length, 15, 80), backgroundColor: '#25c2ee' },
        { label: '阿May', data: rnd(L.length, 10, 70), backgroundColor: '#7b8cff' }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  })
}

function drawAcc() {
  const L = dim[dAcc.value].labels
  const ok = rnd(L.length, 30, 120)
  const fail = rnd(L.length, 2, 20)
  if (chAcc) chAcc.destroy()
  chAcc = new Chart(accCanvas.value, {
    data: {
      labels: L,
      datasets: [
        { type: 'bar', label: '发布成功', data: ok, backgroundColor: '#21ba72', stack: 's' },
        { type: 'bar', label: '发布失败', data: fail, backgroundColor: '#f5455c', stack: 's' },
        { type: 'line', label: '成功率%', data: ok.map((v, i) => Math.round((v / (v + fail[i])) * 100)), borderColor: '#3a7afe', yAxisID: 'y1', tension: 0.3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, stacked: true }, y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false } } }
    }
  })
}

function setUser(d) { dUser.value = d; drawUser() }
function setAcc(d) { dAcc.value = d; drawAcc() }

onMounted(() => nextTick(() => { drawUser(); drawAcc() }))
onBeforeUnmount(() => { if (chUser) chUser.destroy(); if (chAcc) chAcc.destroy() })
</script>

<template>
  <section>
    <div class="cards">
      <div class="card kpi"><div class="lbl">今日发布总数</div><div class="num">38</div></div>
      <div class="card kpi"><div class="lbl">今日成功</div><div class="num ok">31</div></div>
      <div class="card kpi"><div class="lbl">今日失败</div><div class="num err">7</div></div>
      <div class="card kpi"><div class="lbl">活跃账号 / 累计发布</div><div class="num">12 / 2,486</div></div>
    </div>

    <div class="panel">
      <h3>用户维度发布统计
        <span class="seg">
          <button v-for="[k, t] in dims" :key="k" :class="{ active: dUser === k }" @click="setUser(k)">{{ t }}</button>
        </span>
      </h3>
      <div class="chart-box"><canvas ref="userCanvas"></canvas></div>
    </div>

    <div class="panel">
      <h3>抖音账号维度 · 发布成功 / 失败统计
        <span class="seg">
          <button v-for="[k, t] in dims" :key="k" :class="{ active: dAcc === k }" @click="setAcc(k)">{{ t }}</button>
        </span>
      </h3>
      <div class="chart-box"><canvas ref="accCanvas"></canvas></div>
    </div>
  </section>
</template>
