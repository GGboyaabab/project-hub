import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'

const EMPTY_PROJECT = {
  favorite: false,
  groupId: null,
  tags: [],
  notes: '',
  command: '',
  itemType: null,
  visibility: 'active',
  expanded: false,
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}

function cleanProject(value = {}) {
  const tags = Array.isArray(value.tags)
    ? [...new Set(value.tags.map((tag) => cleanText(tag, 20).trim()).filter(Boolean))].slice(0, 8)
    : []

  return {
    favorite: Boolean(value.favorite),
    groupId: typeof value.groupId === 'string' && value.groupId ? value.groupId : null,
    tags,
    notes: cleanText(value.notes, 2000),
    command: cleanText(value.command, 2000),
    itemType: ['app', 'source', 'dataset', 'document'].includes(value.itemType) ? value.itemType : null,
    visibility: ['archived', 'hidden'].includes(value.visibility) ? value.visibility : 'active',
    expanded: value.expanded === true,
  }
}

function cleanGroupName(name) {
  const cleaned = cleanText(name, 30).trim()
  if (!cleaned) throw new Error('分组名称不能为空')
  return cleaned
}

export class SettingsStore {
  constructor(filePath) {
    this.filePath = filePath
    this.state = { groups: [], projects: {}, organizationVersion: 0, managedRoot: null }
    this.pendingWrite = Promise.resolve()
  }

  async init() {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    try {
      const saved = JSON.parse(await readFile(this.filePath, 'utf8'))
      this.state = {
        managedRoot: typeof saved.managedRoot === 'string' && path.isAbsolute(saved.managedRoot) ? saved.managedRoot : null,
        organizationVersion: saved.organizationVersion === 1 ? 1 : 0,
        groups: Array.isArray(saved.groups)
          ? saved.groups
              .filter((group) => group && typeof group.id === 'string' && typeof group.name === 'string')
              .map((group) => ({ id: group.id, name: cleanText(group.name, 30) }))
          : [],
        projects: Object.fromEntries(
          Object.entries(saved.projects ?? {}).map(([projectPath, value]) => [projectPath, cleanProject(value)]),
        ),
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn('设置文件读取失败，将使用默认设置：', error.message)
      this.state = { groups: [], projects: {}, organizationVersion: 0, managedRoot: null }
    }
  }

  getGroups() {
    return this.state.groups.map((group) => ({ ...group }))
  }

  getProject(projectPath) {
    const project = cleanProject({ ...EMPTY_PROJECT, ...this.state.projects[projectPath] })
    if (!this.state.groups.some((group) => group.id === project.groupId)) project.groupId = null
    return project
  }

  async updateProject(projectPath, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('配置格式无效')
    if ('itemType' in patch && !['app', 'source', 'dataset', 'document'].includes(patch.itemType)) throw new Error('条目类型无效')
    if ('visibility' in patch && !['active', 'archived', 'hidden'].includes(patch.visibility)) throw new Error('显示状态无效')
    if ('expanded' in patch && typeof patch.expanded !== 'boolean') throw new Error('展开设置无效')
    const current = this.getProject(projectPath)
    const project = cleanProject({ ...current, ...patch })
    if (!this.state.groups.some((group) => group.id === project.groupId)) project.groupId = null
    this.state.projects[projectPath] = project
    await this.persist()
    return this.getProject(projectPath)
  }

  getManagedRoot() { return this.state.managedRoot }

  async setManagedRoot(root) {
    if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('管理目录必须是绝对路径')
    const previous = this.state.managedRoot
    this.state.managedRoot = path.resolve(root)
    try { await this.persist() }
    catch (error) { this.state.managedRoot = previous; throw error }
  }

  getExpandedPaths() {
    return Object.entries(this.state.projects)
      .filter(([, value]) => value.expanded && value.visibility === 'active')
      .map(([projectPath]) => projectPath)
  }

  async initializeProjects(projects) {
    let changed = false
    if (this.state.organizationVersion !== 1) {
      try {
        await copyFile(this.filePath, `${this.filePath}.before-1.1.json`, constants.COPYFILE_EXCL)
      } catch (error) {
        if (!['ENOENT', 'EEXIST'].includes(error.code)) throw error
      }
      const presets = {
        ddos2026: ['毕业设计', 'dataset', ['数据集', '训练', '实验结果', '重要'], '毕设数据与实验记录；数据来源、训练入口和最终结果位置可补充在此。'],
        ds_harness: ['工具归档', 'source', ['AI工具', '旧版', '待清理'], '已计划使用官方版本；清理前核对个人配置、本地修改和使用记录。归档不会删除文件。'],
        github: ['开源学习', 'source', ['下载源码', '参考项目'], '从 GitHub 下载的项目；各子项目可以独立分类、收藏和记录用途。'],
        job: ['求职资料', 'document', ['简历', '投递材料', '重要'], '求职相关资料；材料、resume 和简历文件保留在原目录。'],
        yiliao: ['医疗研究', 'dataset', ['代码', '数据集', '重要'], '医疗项目与数据；cls、data 和原始压缩包保留在原目录。'],
      }
      for (const project of projects.filter((item) => !item.parentPath)) {
        const preset = presets[project.name.toLowerCase()]
        if (!preset) continue
        const [name, itemType, tags, notes] = preset
        let group = this.state.groups.find((item) => item.name === name)
        if (!group) {
          group = { id: randomUUID(), name }
          this.state.groups.push(group)
        }
        const current = this.getProject(project.path)
        this.state.projects[project.path] = cleanProject({
          ...current,
          groupId: current.groupId || group.id,
          itemType: current.itemType || itemType,
          tags: [...current.tags, ...tags],
          notes: current.notes || notes,
          expanded: current.expanded || project.name.toLowerCase() === 'github',
          visibility: project.name.toLowerCase() === 'ds_harness' ? 'archived' : current.visibility,
        })
      }
      this.state.organizationVersion = 1
      changed = true
    }
    for (const project of projects) {
      if (project.parentPath && !Object.hasOwn(this.state.projects, project.path)) {
        this.state.projects[project.path] = cleanProject({ groupId: this.getProject(project.parentPath).groupId })
        changed = true
      }
    }
    if (changed) await this.persist()
  }

  async createGroup(name) {
    const cleaned = cleanGroupName(name)
    this.assertUniqueName(cleaned)
    const group = { id: randomUUID(), name: cleaned }
    this.state.groups.push(group)
    await this.persist()
    return { ...group }
  }

  async renameGroup(id, name) {
    const group = this.state.groups.find((item) => item.id === id)
    if (!group) throw new Error('分组不存在')
    const cleaned = cleanGroupName(name)
    this.assertUniqueName(cleaned, id)
    group.name = cleaned
    await this.persist()
  }

  async deleteGroup(id) {
    this.state.groups = this.state.groups.filter((group) => group.id !== id)
    for (const project of Object.values(this.state.projects)) {
      if (project.groupId === id) project.groupId = null
    }
    await this.persist()
  }

  assertUniqueName(name, exceptId = null) {
    if (this.state.groups.some((group) => group.id !== exceptId && group.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('同名分组已存在')
    }
  }

  persist() {
    const content = `${JSON.stringify(this.state, null, 2)}\n`
    const write = this.pendingWrite.then(async () => {
      const temporaryPath = `${this.filePath}.tmp`
      await writeFile(temporaryPath, content, 'utf8')
      await rename(temporaryPath, this.filePath)
    })
    this.pendingWrite = write.catch(() => {})
    return write
  }
}
