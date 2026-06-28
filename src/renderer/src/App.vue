<script setup>
import { computed } from 'vue'
import Dashboard from './pages/Dashboard.vue'
import Accounts from './pages/Accounts.vue'
import Publish from './pages/Publish.vue'
import PublishList from './pages/PublishList.vue'
import Placeholder from './pages/Placeholder.vue'
import { toastMsg } from './toast'
import { activePage } from './nav'

const pages = {
  dashboard: { comp: Dashboard, title: ['首页 · 数据大屏', '实时发布概览'] },
  accounts: { comp: Accounts, title: ['抖音账号列表', '抖音关联管理'] },
  publish: { comp: Publish, title: ['视频发布', '自动发布管理'] },
  publist: { comp: PublishList, title: ['发布列表', '自动发布管理'] },
  'sys-user': { comp: Placeholder, title: ['用户管理', '系统管理'], props: { icon: '👥', name: '用户管理', desc: '系统用户增删改查、启用/禁用、重置密码、分配角色（本期预留）' } },
  'sys-role': { comp: Placeholder, title: ['角色管理', '系统管理'], props: { icon: '🔑', name: '角色管理', desc: '角色定义、角色↔菜单/操作权限绑定（本期预留）' } },
  'sys-menu': { comp: Placeholder, title: ['菜单管理', '系统管理'], props: { icon: '🧩', name: '菜单管理', desc: '菜单项维护、菜单↔权限点关联、可见性控制（本期预留）' } }
}

const menu = [
  { type: 'item', key: 'dashboard', ic: '📊', label: '首页 · 数据大屏' },
  { type: 'group', label: '抖音关联管理' },
  { type: 'item', key: 'accounts', ic: '👤', label: '抖音账号列表' },
  { type: 'group', label: '自动发布管理' },
  { type: 'item', key: 'publish', ic: '🎬', label: '视频发布' },
  { type: 'item', key: 'publist', ic: '📋', label: '发布列表' },
  { type: 'group', label: '系统管理' },
  { type: 'item', key: 'sys-user', ic: '·', label: '用户管理', sub: true },
  { type: 'item', key: 'sys-role', ic: '·', label: '角色管理', sub: true },
  { type: 'item', key: 'sys-menu', ic: '·', label: '菜单管理', sub: true }
]

const cur = computed(() => pages[activePage.value])
</script>

<template>
  <div class="app">
    <aside class="side">
      <div class="brand"><span class="dot"></span>抖音自动化系统</div>
      <nav class="menu">
        <template v-for="(m, i) in menu" :key="i">
          <div v-if="m.type === 'group'" class="grp-title">{{ m.label }}</div>
          <div
            v-else
            class="mi"
            :class="{ active: activePage === m.key, sub: m.sub }"
            @click="activePage = m.key"
          >
            <span class="ic">{{ m.ic }}</span>{{ m.label }}
          </div>
        </template>
      </nav>
    </aside>

    <div class="main">
      <header class="top">
        <div class="crumb">{{ cur.title[0] }} <small>{{ cur.title[1] }}</small></div>
        <div class="user"><span>运营 · 子苏</span><span class="avatar"></span></div>
      </header>
      <div class="content">
        <component :is="cur.comp" v-bind="cur.props || {}" />
      </div>
    </div>

    <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
  </div>
</template>
