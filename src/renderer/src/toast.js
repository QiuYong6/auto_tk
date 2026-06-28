import { ref } from 'vue'

export const toastMsg = ref('')
let timer = null

export function toast(message) {
  toastMsg.value = message
  clearTimeout(timer)
  timer = setTimeout(() => (toastMsg.value = ''), 2200)
}
