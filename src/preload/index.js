import { contextBridge, ipcRenderer } from 'electron'

// 渲染进程通过 window.api.* 调用主进程能力（受控、不暴露 Node 全权限）
contextBridge.exposeInMainWorld('api', {
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  listVideos: (folder) => ipcRenderer.invoke('files:listVideos', folder),
  listArchive: (folder) => ipcRenderer.invoke('files:listArchive', folder),
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  addAccount: (a) => ipcRenderer.invoke('accounts:add', a),
  updateAccount: (a) => ipcRenderer.invoke('accounts:update', a),
  setAccountStatus: (id, status) => ipcRenderer.invoke('accounts:setStatus', { id, status }),
  deleteAccount: (id) => ipcRenderer.invoke('accounts:delete', id),
  loginAccount: (id) => ipcRenderer.invoke('account:login', id),
  onAccountStatus: (cb) => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('account:status', handler)
    return () => ipcRenderer.removeListener('account:status', handler)
  },
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  runPublish: (cfg) => ipcRenderer.invoke('publish:run', cfg),
  runTask: (taskId) => ipcRenderer.invoke('publish:runTask', taskId),
  postVideo: (payload) => ipcRenderer.invoke('publish:postVideo', payload),
  debugPostFlow: (payload) => ipcRenderer.invoke('debug:postFlow', payload),
  onLog: (cb) => {
    const handler = (_e, line) => cb(line)
    ipcRenderer.on('publish:log', handler)
    return () => ipcRenderer.removeListener('publish:log', handler)
  }
})
