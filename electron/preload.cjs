const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('projectHub', {
  getModelSettings: () => ipcRenderer.invoke('hub:model-settings'),
  saveModelSettings: (input) => ipcRenderer.invoke('hub:save-model-settings', input),
  completeBranch: (input) => ipcRenderer.invoke('hub:complete-branch', input),
  getState: () => ipcRenderer.invoke('hub:get-state'),
  refresh: () => ipcRenderer.invoke('hub:refresh'),
  chooseRoot: () => ipcRenderer.invoke('hub:choose-root'),
  saveKnowledge: (input) => ipcRenderer.invoke('hub:save-knowledge', input),
  deleteKnowledge: (id) => ipcRenderer.invoke('hub:delete-knowledge', id),
  chooseKnowledgeFile: () => ipcRenderer.invoke('hub:choose-knowledge-file'),
  openKnowledge: (id) => ipcRenderer.invoke('hub:open-knowledge', id),
  updateProject: (projectPath, patch) => ipcRenderer.invoke('hub:update-project', projectPath, patch),
  createGroup: (name) => ipcRenderer.invoke('hub:create-group', name),
  renameGroup: (id, name) => ipcRenderer.invoke('hub:rename-group', id, name),
  deleteGroup: (id) => ipcRenderer.invoke('hub:delete-group', id),
  startProject: (projectPath, command) => ipcRenderer.invoke('hub:start-project', projectPath, command),
  stopProject: (projectPath) => ipcRenderer.invoke('hub:stop-project', projectPath),
  clearLogs: (projectPath) => ipcRenderer.invoke('hub:clear-logs', projectPath),
  calculateSize: (projectPath) => ipcRenderer.invoke('hub:calculate-size', projectPath),
  openFolder: (projectPath) => ipcRenderer.invoke('hub:open-folder', projectPath),
  onRuntimeChanged: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('hub:runtime-changed', listener)
    return () => ipcRenderer.removeListener('hub:runtime-changed', listener)
  },
})
