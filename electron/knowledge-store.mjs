import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'

function text(value, limit) {
  return typeof value === 'string' ? value.slice(0, limit).trim() : ''
}

function cleanBranches(value = []) {
  if (!Array.isArray(value) || value.length > 200) throw new Error('每条知识最多保存 200 个分支')
  const branches = value.map(branch => {
    if (!branch || typeof branch !== 'object' || typeof branch.id !== 'string' || !branch.id || branch.id.length > 100 || !['question', 'idea', 'explanation'].includes(branch.kind)) throw new Error('分支格式无效')
    if (branch.parentId !== null && (typeof branch.parentId !== 'string' || !branch.parentId)) throw new Error('分支父节点无效')
    const title = text(branch.title, 120)
    const quote = text(branch.quote, 2000)
    if (!title || !quote) throw new Error('请填写分支标题与引用原文')
    return { id: branch.id, parentId: branch.parentId, quote, title, kind: branch.kind, content: typeof branch.content === 'string' ? branch.content.slice(0, 20000) : '' }
  })
  const byId = new Map(branches.map(branch => [branch.id, branch]))
  if (byId.size !== branches.length) throw new Error('分支标识重复')
  for (const branch of branches) {
    const visited = new Set([branch.id])
    let parentId = branch.parentId
    while (parentId !== null) {
      if (visited.has(parentId)) throw new Error('分支不能循环引用')
      visited.add(parentId)
      const parent = byId.get(parentId)
      if (!parent) throw new Error('分支父节点不存在')
      parentId = parent.parentId
    }
  }
  return branches
}

export function cleanKnowledge(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('知识条目格式无效')
  const title = text(input.title, 120)
  if (!title) throw new Error('请填写知识标题')
  if (!['note', 'link', 'file'].includes(input.kind)) throw new Error('知识类型无效')
  let target = input.kind === 'note' ? '' : text(input.target, 4096)
  if (input.kind === 'link') {
    let url
    try { url = new URL(target) } catch { throw new Error('请填写完整的 HTTP 或 HTTPS 网页地址') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('只支持不含账号密码的 HTTP 或 HTTPS 网页地址')
    target = url.href
  }
  if (input.kind === 'file' && (!path.isAbsolute(target) || target.startsWith('\\\\') || target.startsWith('//'))) throw new Error('请选择本机文件的绝对路径')
  const projectPath = text(input.projectPath, 4096) || null
  if (projectPath && !path.isAbsolute(projectPath)) throw new Error('关联项目路径无效')
  if (input.pinned !== undefined && typeof input.pinned !== 'boolean') throw new Error('置顶设置无效')
  return {
    title,
    kind: input.kind,
    category: text(input.category, 30) || '未分类',
    tags: Array.isArray(input.tags) ? [...new Set(input.tags.map(tag => text(tag, 20)).filter(Boolean))].slice(0, 8) : [],
    content: typeof input.content === 'string' ? input.content.slice(0, 20000) : '',
    target,
    projectPath,
    pinned: input.pinned === true,
    branches: cleanBranches(input.branches),
  }
}

export class KnowledgeStore {
  constructor(filePath) {
    this.filePath = filePath
    this.entries = []
    this.loadError = null
    this.pendingWrite = Promise.resolve()
  }

  async init() {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    try {
      const saved = JSON.parse(await readFile(this.filePath, 'utf8'))
      if (!Array.isArray(saved)) throw new Error('知识库格式无效')
      const ids = new Set()
      const entries = saved.map(value => {
        if (!value || typeof value.id !== 'string' || !value.id || ids.has(value.id) || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('知识库条目记录无效')
        ids.add(value.id)
        return { ...cleanKnowledge(value), id: value.id, createdAt: value.createdAt, updatedAt: value.updatedAt }
      })
      this.entries = entries
    } catch (error) {
      if (error.code !== 'ENOENT') this.loadError = `知识库读取失败，原文件已保留，请检查 ${this.filePath}：${error.message}`
    }
  }

  getEntries() {
    return this.entries.map(entry => ({ ...entry, tags: [...entry.tags], branches: entry.branches.map(branch => ({ ...branch })) }))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
  }

  getEntry(id) {
    const entry = this.getEntries().find(value => value.id === id)
    if (!entry) throw new Error('知识条目不存在，请刷新后重试')
    return entry
  }

  save(input) {
    const cleaned = cleanKnowledge(input)
    if (input.id !== undefined && (typeof input.id !== 'string' || !input.id)) throw new Error('知识条目标识无效')
    return this.mutate(entries => {
      const previous = input.id ? entries.find(entry => entry.id === input.id) : null
      if (input.id && !previous) throw new Error('知识条目不存在，请刷新后重试')
      if (previous && input.branches === undefined) cleaned.branches = previous.branches.map(branch => ({ ...branch }))
      const now = new Date().toISOString()
      const entry = { ...cleaned, id: previous?.id ?? randomUUID(), createdAt: previous?.createdAt ?? now, updatedAt: now }
      return { entries: [entry, ...entries.filter(value => value.id !== entry.id)], result: structuredClone(entry) }
    })
  }

  delete(id) {
    return this.mutate(entries => {
      if (!entries.some(entry => entry.id === id)) throw new Error('知识条目不存在，请刷新后重试')
      return { entries: entries.filter(entry => entry.id !== id) }
    })
  }

  mutate(operation) {
    const write = this.pendingWrite.then(async () => {
      if (this.loadError) throw new Error(this.loadError)
      const next = operation(this.entries)
      const temporary = `${this.filePath}.tmp`
      await writeFile(temporary, `${JSON.stringify(next.entries, null, 2)}\n`, 'utf8')
      await rename(temporary, this.filePath)
      this.entries = next.entries
      return next.result
    })
    this.pendingWrite = write.catch(() => {})
    return write
  }
}
