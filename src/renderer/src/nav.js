import { ref } from 'vue'

// 全局当前页面，供任意组件跳转（如发布列表「新增」→ 视频发布）
export const activePage = ref('dashboard')
export function go(page) {
  activePage.value = page
}
