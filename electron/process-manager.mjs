import { spawn } from 'node:child_process'

const MAX_LOG_ENTRIES = 500
let nextLogId = 1

function idleRuntime() {
  return { status: 'idle', pid: null, exitCode: null, logs: [] }
}

function copyRuntime(runtime) {
  return {
    status: runtime.status,
    pid: runtime.pid,
    exitCode: runtime.exitCode,
    logs: runtime.logs.map((entry) => ({ ...entry })),
  }
}

export class ProcessManager {
  constructor(onChange) {
    this.entries = new Map()
    this.onChange = onChange
  }

  getRuntime(projectPath) {
    const entry = this.entries.get(projectPath)
    return entry ? copyRuntime(entry.runtime) : idleRuntime()
  }

  start(projectPath, command, cwd) {
    const previous = this.entries.get(projectPath)
    if (previous && ['running', 'stopping'].includes(previous.runtime.status)) {
      throw new Error('项目已在运行中')
    }
    if (typeof command !== 'string' || !command.trim()) throw new Error('请先设置启动命令')

    const runtime = { ...idleRuntime(), status: 'running' }
    const entry = { child: null, runtime }
    this.entries.set(projectPath, entry)
    this.appendLog(projectPath, 'system', `执行命令：${command.trim()}`)

    try {
      const child = spawn(command.trim(), {
        cwd,
        shell: true,
        windowsHide: true,
        env: { ...process.env, BROWSER: 'none' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      entry.child = child
      runtime.pid = child.pid ?? null
      child.stdout.on('data', (chunk) => this.appendLog(projectPath, 'stdout', chunk.toString()))
      child.stderr.on('data', (chunk) => this.appendLog(projectPath, 'stderr', chunk.toString()))
      child.on('error', (error) => {
        if (this.entries.get(projectPath) !== entry) return
        runtime.status = 'error'
        this.appendLog(projectPath, 'system', `启动失败：${error.message}`)
        this.emit(projectPath)
      })
      child.on('exit', (code, signal) => {
        if (this.entries.get(projectPath) !== entry) return
        const wasStopping = runtime.status === 'stopping'
        runtime.exitCode = typeof code === 'number' ? code : null
        runtime.status = wasStopping || code === 0 ? 'exited' : 'error'
        runtime.pid = null
        const detail = signal ? `信号 ${signal}` : `退出码 ${code ?? '未知'}`
        this.appendLog(projectPath, 'system', `进程已结束（${detail}）`)
        this.emit(projectPath)
      })
    } catch (error) {
      runtime.status = 'error'
      runtime.pid = null
      this.appendLog(projectPath, 'system', `启动失败：${error.message}`)
    }

    this.emit(projectPath)
    return this.getRuntime(projectPath)
  }

  stop(projectPath) {
    const entry = this.entries.get(projectPath)
    if (!entry || !['running', 'stopping'].includes(entry.runtime.status)) return this.getRuntime(projectPath)
    if (entry.runtime.status === 'stopping') return this.getRuntime(projectPath)
    if (!entry.child?.pid) {
      entry.runtime.status = 'error'
      this.appendLog(projectPath, 'system', '无法停止：进程 ID 不存在')
      this.emit(projectPath)
      return this.getRuntime(projectPath)
    }

    entry.runtime.status = 'stopping'
    this.appendLog(projectPath, 'system', '正在停止进程树…')
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(entry.child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.on('error', (error) => {
        entry.runtime.status = 'error'
        this.appendLog(projectPath, 'system', `停止失败：${error.message}`)
        this.emit(projectPath)
      })
    } else {
      entry.child.kill('SIGTERM')
    }
    this.emit(projectPath)
    return this.getRuntime(projectPath)
  }

  clear(projectPath) {
    const entry = this.entries.get(projectPath)
    if (entry) {
      entry.runtime.logs = []
      this.emit(projectPath)
    }
    return this.getRuntime(projectPath)
  }

  stopAll() {
    for (const [projectPath, entry] of this.entries) {
      if (entry.runtime.status === 'running') {
        try {
          this.stop(projectPath)
        } catch {
        }
      }
    }
  }

  appendLog(projectPath, stream, text) {
    const entry = this.entries.get(projectPath)
    if (!entry || !text) return
    const cleaned = String(text).slice(-8000)
    entry.runtime.logs.push({
      id: nextLogId++,
      stream,
      text: cleaned,
      timestamp: new Date().toISOString(),
    })
    if (entry.runtime.logs.length > MAX_LOG_ENTRIES) {
      entry.runtime.logs.splice(0, entry.runtime.logs.length - MAX_LOG_ENTRIES)
    }
    this.emit(projectPath)
  }

  emit(projectPath) {
    this.onChange(projectPath, this.getRuntime(projectPath))
  }
}
