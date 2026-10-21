import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import { ModelApi } from './model-api.mjs'
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stat } from 'node:fs/promises'
import { cleanKnowledge, KnowledgeStore } from './knowledge-store.mjs'
import { ProcessManager } from './process-manager.mjs'
import { calculateProjectSize, resolveProject, scanProjects } from './project-scanner.mjs'
import { SettingsStore } from './settings-store.mjs'

const electronDirectory = path.dirname(fileURLToPath(import.meta.url))
const appDirectory = path.resolve(electronDirectory, '..')
const managedRoot = path.resolve(process.env.PROJECT_HUB_ROOT || 'D:/0-0_ckf')
const production = app.isPackaged || process.argv.includes('--production')
const developmentUrl = 'http://127.0.0.1:5176/'

let mainWindow = null
let devServer = null
let spawnedDevServer = false
let projectCache = []
let store = null
let processManager = null
let knowledgeStore = null
let modelApi = null

function pingDevelopmentServer() {
  return new Promise((resolve) => {
    const request = http.get(developmentUrl, (response) => {
      response.resume()
      resolve(true)
    })
    request.on('error', () => resolve(false))
    request.setTimeout(800, () => {
      request.destroy()
      resolve(false)
    })
  })
}

async function ensureDevelopmentServer() {
  if (await pingDevelopmentServer()) return
  const executable = path.join(appDirectory, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')
  const command = process.platform === 'win32' ? `"${executable}"` : executable
  spawnedDevServer = true
  devServer = spawn(command, ['--host', '127.0.0.1', '--port', '5176', '--strictPort'], {
    cwd: appDirectory,
    shell: process.platform === 'win32',
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, BROWSER: 'none' },
  })

  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (await pingDevelopmentServer()) return
    await new Promise((resolve) => setTimeout(resolve, 350))
  }
  throw new Error('界面开发服务启动超时')
}

function stopDevelopmentServer() {
  if (!spawnedDevServer || !devServer?.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(devServer.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } else {
    devServer.kill('SIGTERM')
  }
  spawnedDevServer = false
}

async function refreshCache() {
  const expanded = store.getExpandedPaths()
  projectCache = await scanProjects(managedRoot, expanded)
  await store.initializeProjects(projectCache)
  if (JSON.stringify(expanded) !== JSON.stringify(store.getExpandedPaths())) {
    projectCache = await scanProjects(managedRoot, store.getExpandedPaths())
    await store.initializeProjects(projectCache)
  }
}

function composeState() {
  return {
    root: managedRoot,
    groups: store.getGroups(),
    knowledge: knowledgeStore.getEntries(),
    knowledgeError: knowledgeStore.loadError,
    projects: projectCache.map((project) => {
      const preferences = store.getProject(project.path)
      return {
        ...project,
        ...preferences,
        itemType: preferences.itemType ?? (preferences.command ? 'app' : project.itemType),
        command: preferences.command || project.suggestedCommand,
        runtime: processManager.getRuntime(project.path),
      }
    }),
  }
}

async function getState(forceRefresh = false) {
  if (forceRefresh || projectCache.length === 0) await refreshCache()
  return composeState()
}

async function findProject(candidatePath) {
  if (projectCache.length === 0) await refreshCache()
  const resolved = await resolveProject(managedRoot, candidatePath, store.getExpandedPaths())
  const project = projectCache.find((item) => item.path === resolved)
  if (!project) throw new Error('项目不在当前扫描结果中，请刷新后重试')
  return project
}

function registerIpc() {
  ipcMain.handle('hub:model-settings', () => modelApi.getSettings())
  ipcMain.handle('hub:save-model-settings', (_event, input) => modelApi.save(input))
  ipcMain.handle('hub:complete-branch', (_event, input) => modelApi.complete(input))
  ipcMain.handle('hub:get-state', () => getState())
  ipcMain.handle('hub:refresh', () => getState(true))
  ipcMain.handle('hub:save-knowledge', async (_event, input) => {
    const cleaned = cleanKnowledge(input)
    const previous = input.id ? knowledgeStore.getEntry(input.id) : null
    if (cleaned.projectPath && cleaned.projectPath !== previous?.projectPath) await findProject(cleaned.projectPath)
    if (cleaned.kind === 'file') {
      try {
        if (!(await stat(cleaned.target)).isFile()) throw new Error('not a file')
      } catch { throw new Error('资料文件不存在或不可访问，请重新选择') }
    }
    const entry = await knowledgeStore.save(input)
    return { state: composeState(), id: entry.id }
  })
  ipcMain.handle('hub:delete-knowledge', async (_event, id) => {
    await knowledgeStore.delete(id)
    return composeState()
  })
  ipcMain.handle('hub:choose-knowledge-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '选择知识资料文件', properties: ['openFile'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle('hub:open-knowledge', async (_event, id) => {
    const entry = cleanKnowledge(knowledgeStore.getEntry(id))
    if (entry.kind === 'link') return shell.openExternal(entry.target)
    if (entry.kind !== 'file') throw new Error('此笔记没有外部来源')
    try {
      if (!(await stat(entry.target)).isFile()) throw new Error('not a file')
    } catch { throw new Error('资料文件已移动、删除或不可访问，请编辑条目重新选择') }
    shell.showItemInFolder(entry.target)
  })
  ipcMain.handle('hub:update-project', async (_event, projectPath, patch) => {
    const project = await findProject(projectPath)
    const running = (item) => ['running', 'stopping'].includes(processManager.getRuntime(item.path).status)
    if (patch?.itemType && patch.itemType !== 'app' && running(project)) throw new Error('请先停止项目，再修改条目类型')
    if ((patch?.visibility && patch.visibility !== 'active') || patch?.expanded === false) {
      const affected = projectCache.filter((item) => item.path === project.path || item.parentPath === project.path)
      if (affected.some(running)) throw new Error('请先停止此目录及子项目的进程，再归档、隐藏或收起')
    }
    if (project.parentPath && patch?.expanded === true) throw new Error('目前只支持展开根目录下的一层子项目')
    await store.updateProject(project.path, patch ?? {})
    if (patch?.expanded !== undefined || patch?.visibility !== undefined) await refreshCache()
    return composeState()
  })
  ipcMain.handle('hub:create-group', async (_event, name) => {
    await store.createGroup(name)
    return composeState()
  })
  ipcMain.handle('hub:rename-group', async (_event, id, name) => {
    await store.renameGroup(id, name)
    return composeState()
  })
  ipcMain.handle('hub:delete-group', async (_event, id) => {
    await store.deleteGroup(id)
    return composeState()
  })
  ipcMain.handle('hub:start-project', async (_event, projectPath, command) => {
    const project = await findProject(projectPath)
    const preferences = store.getProject(project.path)
    const itemType = preferences.itemType ?? (preferences.command ? 'app' : project.itemType)
    if (itemType !== 'app') throw new Error('只有应用类型可以启动，请先修改条目类型并保存')
    if (preferences.visibility !== 'active') throw new Error('请先恢复到日常视图，再启动应用')
    await store.updateProject(project.path, { command: String(command ?? '').trim() })
    processManager.start(project.path, command, project.path)
    return composeState()
  })
  ipcMain.handle('hub:stop-project', async (_event, projectPath) => {
    const project = await findProject(projectPath)
    processManager.stop(project.path)
    return composeState()
  })
  ipcMain.handle('hub:clear-logs', async (_event, projectPath) => {
    const project = await findProject(projectPath)
    processManager.clear(project.path)
    return composeState()
  })
  ipcMain.handle('hub:calculate-size', async (_event, projectPath) => {
    const project = await findProject(projectPath)
    return calculateProjectSize(project.path)
  })
  ipcMain.handle('hub:open-folder', async (_event, projectPath) => {
    const project = await findProject(projectPath)
    const error = await shell.openPath(project.path)
    if (error) throw new Error(error)
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: '项目中台',
    icon: path.join(appDirectory, 'assets', 'icon.png'),
    backgroundColor: '#f5f7fb',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(electronDirectory, 'preload.cjs'),
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question', title: '内容尚未保存', message: '当前知识条目、分支或设置尚未保存。',
      detail: '可以继续编辑，或放弃修改后离开。', buttons: ['继续编辑', '放弃修改并离开'], defaultId: 0, cancelId: 0,
    })
    if (choice === 1) event.preventDefault()
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (production) {
    void mainWindow.loadFile(path.join(appDirectory, 'dist', 'index.html'))
  } else {
    void mainWindow.loadURL(developmentUrl)
  }
}

app.setName('项目中台')
app.setAppUserModelId('local.projecthub.desktop')

const ownsInstance = app.requestSingleInstanceLock()
if (!ownsInstance) app.quit()
app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

if (ownsInstance) app.whenReady().then(async () => {
  try {
    store = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'))
    await store.init()
    knowledgeStore = new KnowledgeStore(path.join(app.getPath('userData'), 'knowledge.json'))
    await knowledgeStore.init()
    modelApi = new ModelApi(path.join(app.getPath('userData'), 'model-api.json'), safeStorage)
    await modelApi.init()
    processManager = new ProcessManager((projectPath, runtime) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hub:runtime-changed', { projectPath, runtime })
      }
    })
    registerIpc()
    if (!production) await ensureDevelopmentServer()
    await refreshCache()
    createWindow()
  } catch (error) {
    dialog.showErrorBox('项目中台无法启动', error instanceof Error ? error.message : String(error))
    stopDevelopmentServer()
    app.quit()
  }
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  processManager?.stopAll()
  stopDevelopmentServer()
})
