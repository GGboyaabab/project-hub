import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ProjectCard } from './components/ProjectCard'
import { ProjectDetails } from './components/ProjectDetails'
import { Sidebar } from './components/Sidebar'
import { KnowledgeSquare } from './components/KnowledgeSquare'
import { ModelSettings } from './components/ModelSettings'
import { IconRefresh } from './components/icons'
import { Logo } from './components/Logo'
import type { HubState, ItemType, Project, ProjectPatch, SizeResult, ViewFilter } from './types'
import { itemTypeLabels } from './utils'
import './knowledge.css'

type SortMode = 'favorite' | 'modified' | 'name'
type Notice = { type: 'success' | 'error'; text: string }

const hub = window.projectHub

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export default function App() {
  const [state, setState] = useState<HubState | null>(null)
  const [initialError, setInitialError] = useState('')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [filter, setFilter] = useState<ViewFilter>({ kind: 'all' })
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('favorite')
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [knowledgeDirty, setKnowledgeDirty] = useState(false)
  const [settingsDirty, setSettingsDirty] = useState(false)

  useEffect(() => {
    let active = true
    hub.getState()
      .then((nextState) => {
        if (active) setState(nextState)
      })
      .catch((error: Error) => {
        if (active) setInitialError(error.message)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    return hub.onRuntimeChanged(({ projectPath, runtime }) => {
      setState((current) => current ? {
        ...current,
        projects: current.projects.map((project) => project.path === projectPath ? { ...project, runtime } : project),
      } : current)
    })
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const deferredSearch = useDeferredValue(search)

  const changeFilter = useCallback((next: ViewFilter) => {
    if (filter.kind === 'knowledge' && next.kind !== 'knowledge' && knowledgeDirty && !window.confirm('当前知识条目尚未保存，放弃这些修改？')) return
    if (filter.kind === 'settings' && next.kind !== 'settings' && settingsDirty && !window.confirm('API 配置尚未保存，放弃这些修改？')) return
    setFilter(next)
  }, [filter.kind, knowledgeDirty, settingsDirty])

  const viewKnowledgeProject = useCallback((project: Project) => {
    setKnowledgeDirty(false)
    setSearch('')
    setTypeFilter('all')
    setSelectedPath(project.path)
    setFilter({ kind: project.visibility === 'active' ? 'all' : project.visibility })
  }, [])

  const applyState = useCallback(async (operation: () => Promise<HubState>, successMessage?: string) => {
    try {
      const nextState = await operation()
      setState(nextState)
      if (successMessage) setNotice({ type: 'success', text: successMessage })
      return true
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) })
      return false
    }
  }, [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await applyState(() => hub.refresh(), '项目列表已刷新')
    setRefreshing(false)
  }, [applyState])

  const updateProject = useCallback((projectPath: string, patch: ProjectPatch) =>
    applyState(() => hub.updateProject(projectPath, patch), '项目配置已保存'), [applyState])

  const toggleFavorite = useCallback(async (project: Project) => {
    await applyState(() => hub.updateProject(project.path, { favorite: !project.favorite }))
  }, [applyState])

  const createGroup = useCallback((name: string) =>
    applyState(() => hub.createGroup(name), '分组已创建'), [applyState])

  const renameGroup = useCallback((id: string, name: string) =>
    applyState(() => hub.renameGroup(id, name), '分组已重命名'), [applyState])

  const deleteGroup = useCallback(async (id: string) => {
    const deleted = await applyState(() => hub.deleteGroup(id), '分组已删除')
    if (deleted && filter.kind === 'group' && filter.groupId === id) setFilter({ kind: 'all' })
    return deleted
  }, [applyState, filter])

  const startStop = useCallback(async (project: Project, draftCommand?: string) => {
    if (['running', 'stopping'].includes(project.runtime.status)) {
      await applyState(() => hub.stopProject(project.path))
      return
    }
    const command = (draftCommand ?? project.command).trim()
    if (!command) {
      setSelectedPath(project.path)
      setNotice({ type: 'error', text: '请先在项目详情中设置启动命令' })
      return
    }
    await applyState(() => hub.startProject(project.path, command))
  }, [applyState])

  const clearLogs = useCallback((projectPath: string) =>
    applyState(() => hub.clearLogs(projectPath)), [applyState])

  const calculateSize = useCallback(async (projectPath: string): Promise<SizeResult | null> => {
    try {
      return await hub.calculateSize(projectPath)
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) })
      return null
    }
  }, [])

  const openFolder = useCallback(async (projectPath: string) => {
    try {
      await hub.openFolder(projectPath)
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) })
    }
  }, [])

  const handleSelect = useCallback((projectPath: string) => setSelectedPath(projectPath), [])

  const visibleProjects = useMemo(() => {
    if (!state) return []
    const query = deferredSearch.trim().toLowerCase()
    const filtered = state.projects.filter((project) => {
      const visibility = filter.kind === 'archived' || filter.kind === 'hidden' ? filter.kind : 'active'
      if (project.visibility !== visibility) return false
      if (typeFilter !== 'all' && project.itemType !== typeFilter) return false
      if (filter.kind === 'favorite' && !project.favorite) return false
      if (filter.kind === 'running' && project.runtime.status !== 'running') return false
      if (filter.kind === 'group' && project.groupId !== filter.groupId) return false
      if (!query) return true
      return [project.name, project.path, project.description, project.notes, itemTypeLabels[project.itemType], ...project.stack, ...project.tags]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
    return [...filtered].sort((a, b) => {
      if (sortMode === 'modified') return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
      if (sortMode === 'favorite' && a.favorite !== b.favorite) return a.favorite ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-CN')
    })
  }, [state, filter, deferredSearch, sortMode, typeFilter])

  const activeProjects = useMemo(
    () => state?.projects.filter((project) => project.visibility === 'active') ?? [],
    [state],
  )
  const groupCounts = useMemo(
    () => state ? Object.fromEntries(state.groups.map((group) => [group.id, activeProjects.filter((project) => project.groupId === group.id).length])) : {},
    [state, activeProjects],
  )

  useEffect(() => {
    const selected = state?.projects.find((project) => project.path === selectedPath)
    const visibility = filter.kind === 'archived' || filter.kind === 'hidden' ? filter.kind : 'active'
    if (!selected || selected.visibility !== visibility) {
      setSelectedPath(visibleProjects[0]?.path ?? null)
    }
  }, [state, visibleProjects, selectedPath, filter.kind])

  if (initialError) {
    return <div className="fatal-state"><h1>项目中台加载失败</h1><p>{initialError}</p><button onClick={() => window.location.reload()}>重新加载</button></div>
  }

  if (!state) {
    return <div className="loading-state"><div className="brand-mark"><Logo size={52} /></div><p>正在扫描本地项目…</p></div>
  }

  const selectedProject = state.projects.find((project) => project.path === selectedPath) ?? null
  const selectedGroup = filter.kind === 'group' ? state.groups.find((group) => group.id === filter.groupId) : null
  const viewTitle = filter.kind === 'favorite' ? '我的收藏' : filter.kind === 'running' ? '运行中的项目' : filter.kind === 'archived' ? '已归档' : filter.kind === 'hidden' ? '已隐藏' : selectedGroup?.name ?? '全部项目'
  const runningCount = state.projects.filter((project) => project.runtime.status === 'running').length

  return (
    <div className="app-shell">
      <Sidebar
        root={state.root}
        groups={state.groups}
        filter={filter}
        totalCount={activeProjects.length}
        favoriteCount={activeProjects.filter((project) => project.favorite).length}
        archivedCount={state.projects.filter((project) => project.visibility === 'archived').length}
        hiddenCount={state.projects.filter((project) => project.visibility === 'hidden').length}
        runningCount={runningCount}
        knowledgeCount={state.knowledge.length}
        groupCounts={groupCounts}
        onFilter={changeFilter}
        onCreate={createGroup}
        onRename={renameGroup}
        onDelete={deleteGroup}
      />

      {filter.kind === 'settings' ? <main className="settings-page"><header><span className="eyebrow">应用偏好</span><h1>设置</h1><p>配置知识分支使用的大模型服务。</p></header><ModelSettings onDirtyChange={setSettingsDirty} /></main> : filter.kind === 'knowledge' ? <KnowledgeSquare state={state} onState={setState} onDirtyChange={setKnowledgeDirty} onViewProject={viewKnowledgeProject} /> : <><main className="workspace">
        <header className="workspace-header">
          <div>
            <span className="eyebrow">本地项目工作台</span>
            <h1>{viewTitle}</h1>
            <p>{visibleProjects.length} 个项目 · {runningCount} 个正在运行</p>
          </div>
          <button className="refresh-button" disabled={refreshing} onClick={() => void refresh()}><IconRefresh size={13} />{refreshing ? '刷新中…' : '刷新项目'}</button>
        </header>

        <div className="toolbar">
          <input
            className="search-input"
            value={search}
            placeholder="搜索名称、技术栈、标签或备注"
            aria-label="搜索项目"
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="type-filter" value={typeFilter} aria-label="条目类型筛选" onChange={(event) => setTypeFilter(event.target.value as ItemType | 'all')}>
            <option value="all">全部类型</option>
            {Object.entries(itemTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="sort-select" value={sortMode} aria-label="项目排序" onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="favorite">收藏优先</option>
            <option value="modified">最近修改</option>
            <option value="name">按名称</option>
          </select>
        </div>

        <div className="project-grid">
          {visibleProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              groups={state.groups}
              selected={selectedPath === project.path}
              onSelect={handleSelect}
              onToggleFavorite={toggleFavorite}
              onStartStop={startStop}
              onOpenFolder={openFolder}
            />
          ))}
          {visibleProjects.length === 0 && (
            <div className="empty-list">
              <h2>没有符合条件的项目</h2>
              <p>尝试清除搜索内容，或切换到其他分组。</p>
              <button onClick={() => { setSearch(''); setFilter({ kind: 'all' }); setTypeFilter('all') }}>查看全部项目</button>
            </div>
          )}
        </div>
      </main>

      <ProjectDetails
        key={selectedProject?.path ?? 'empty'}
        project={selectedProject}
        groups={state.groups}
        onUpdate={updateProject}
        onStartStop={startStop}
        onClearLogs={clearLogs}
        onCalculateSize={calculateSize}
        onOpenFolder={openFolder}
      />
      </>}

      {notice && <div className={`toast ${notice.type}`} role="status">{notice.text}</div>}
    </div>
  )
}
