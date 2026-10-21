import { memo, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { ProjectGroup, ViewFilter } from '../types'
import { IconArchive, IconBolt, IconBook, IconEyeOff, IconFolder, IconGear, IconGrid, IconPlus, IconStar } from './icons'
import { Logo } from './Logo'

interface SidebarProps {
  root: string
  groups: ProjectGroup[]
  filter: ViewFilter
  totalCount: number
  favoriteCount: number
  archivedCount: number
  hiddenCount: number
  runningCount: number
  knowledgeCount: number
  groupCounts: Record<string, number>
  onFilter: (filter: ViewFilter) => void
  onChooseRoot: () => Promise<void>
  onCreate: (name: string) => Promise<boolean>
  onRename: (id: string, name: string) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}

export const Sidebar = memo(function Sidebar({ root, groups, filter, totalCount, favoriteCount, archivedCount, hiddenCount, runningCount, knowledgeCount, groupCounts, onFilter, onChooseRoot, onCreate, onRename, onDelete }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false } })
  const [more, setMore] = useState(false)
  const [creating, setCreating] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const menuGroup = groups.find(group => group.id === menuId)
  const rootName = root.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || root
  const moreVisible = more
  useEffect(() => { if (filter.kind === 'archived' || filter.kind === 'hidden') setMore(true) }, [filter.kind])

  function toggleCollapsed() {
    setCollapsed(!collapsed)
    try { localStorage.setItem('sidebar-collapsed', String(!collapsed)) } catch { /* Layout works without persistent storage. */ }
    setWorkspaceOpen(false); setMenuId(null)
  }
  function navigate(next: ViewFilter) { onFilter(next); setMenuId(null) }
  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!newName.trim() || busy) return
    setBusy(true)
    try { if (await onCreate(newName)) { setNewName(''); setCreating(false) } }
    finally { setBusy(false) }
  }
  async function handleRename(event: FormEvent) {
    event.preventDefault()
    if (!menuGroup || !renameName.trim() || busy) return
    setBusy(true)
    try { if (await onRename(menuGroup.id, renameName)) { setRenaming(false); setMenuId(null) } }
    finally { setBusy(false) }
  }
  async function handleDelete() {
    if (!menuGroup || busy || !window.confirm(`删除分组“${menuGroup.name}”？项目文件和收藏设置不会删除。`)) return
    setBusy(true)
    try { if (await onDelete(menuGroup.id)) setMenuId(null) }
    finally { setBusy(false) }
  }
  function item(kind: Exclude<ViewFilter['kind'], 'group'>, label: string, icon: React.ReactNode, count?: number) {
    return <button className={`nav-${kind} ${kind === 'knowledge' ? 'knowledge-nav' : kind === 'settings' ? 'settings-nav' : ''} ${filter.kind === kind ? 'active' : ''}`} aria-current={filter.kind === kind ? 'page' : undefined} aria-label={label} title={collapsed ? label : undefined} onClick={() => navigate({ kind })}>
      {icon}<span className="nav-label">{label}</span>{count !== undefined && count > 0 && <b>{count}</b>}
      {kind === 'running' && runningCount > 0 && <i className="running-dot" aria-hidden="true" />}
    </button>
  }
  return <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="侧边导航">
    <div className="brand"><div className="brand-mark"><Logo size={32} /></div><div className="brand-name"><strong>项目中台</strong><span>Project Hub</span></div></div>
    <button className="sidebar-toggle" aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} aria-expanded={!collapsed} onClick={toggleCollapsed}>{collapsed ? '›' : '‹'}</button>
    <div className="workspace-switcher">
      <button className="workspace-trigger" title={root} aria-label="当前工作区" aria-expanded={workspaceOpen} onClick={() => { if (collapsed) toggleCollapsed(); setWorkspaceOpen(!workspaceOpen) }}><IconFolder size={16} /><span><small>当前工作区</small><strong>{rootName}</strong></span><i aria-hidden="true">⌄</i></button>
      {workspaceOpen && <div className="workspace-popover"><span>管理目录</span><code>{root}</code><button disabled={busy} onClick={async () => { setBusy(true); try { await onChooseRoot(); setWorkspaceOpen(false) } finally { setBusy(false) } }}>切换目录…</button><button onClick={() => setWorkspaceOpen(false)}>关闭</button></div>}
    </div>
    <div className="sidebar-scroll">
      <nav className="sidebar-nav" aria-label="工作台">
        <div className="section-caption">工作台</div>
        {item('all', '全部项目', <IconGrid />, totalCount)}
        {item('knowledge', '知识广场', <IconBook />, knowledgeCount)}
      </nav>
      <nav className="sidebar-nav project-views" aria-label="项目视图">
        <div className="section-caption">项目视图</div>
        {item('favorite', '我的收藏', <IconStar />, favoriteCount)}
        {item('running', '运行中', <IconBolt />, runningCount)}
        <button className="more-views" aria-label="更多视图" title={collapsed ? '更多视图' : undefined} aria-expanded={moreVisible} onClick={() => setMore(!moreVisible)}><span className="more-icon" aria-hidden="true">{moreVisible ? '⌄' : '›'}</span><span className="nav-label">更多视图</span></button>
        {moreVisible && <div className="secondary-views">{item('archived', '已归档', <IconArchive />, archivedCount)}{item('hidden', '已隐藏', <IconEyeOff />, hiddenCount)}</div>}
      </nav>
      <section className="group-section" aria-label="项目分组">
        <div className="section-caption"><span>项目分组</span><button className="group-create-toggle" aria-label={creating ? '取消新建分组' : '新建分组'} aria-expanded={creating} disabled={busy} onClick={() => setCreating(!creating)}><IconPlus size={15} /></button></div>
        {creating && !collapsed && <form className="new-group-form" onSubmit={event => void handleCreate(event)}><input value={newName} maxLength={30} autoFocus placeholder="新分组名称" aria-label="新分组名称" onChange={event => setNewName(event.target.value)} /><button type="submit" disabled={busy || !newName.trim()}>新建</button></form>}
        <div className="group-list">{groups.map(group => <div className="group-item" key={group.id}>
          <div className="group-row"><button className={`group-select ${filter.kind === 'group' && filter.groupId === group.id ? 'active' : ''}`} aria-current={filter.kind === 'group' && filter.groupId === group.id ? 'page' : undefined} title={group.name} onClick={() => navigate({ kind: 'group', groupId: group.id })}><IconFolder size={15} /><span>{group.name}</span>{(groupCounts[group.id] ?? 0) > 0 && <b>{groupCounts[group.id]}</b>}</button><button className="group-menu-toggle" aria-label={`管理分组 ${group.name}`} aria-expanded={menuId === group.id} disabled={busy} onClick={() => { setMenuId(menuId === group.id ? null : group.id); setRenameName(group.name); setRenaming(false) }}>⋯</button></div>
          {menuId === group.id && !collapsed && <div className="group-actions" onKeyDown={event => { if (event.key === 'Escape' && !busy) setMenuId(null) }}>{renaming ? <form onSubmit={event => void handleRename(event)}><input aria-label="重命名分组" value={renameName} maxLength={30} disabled={busy} onChange={event => setRenameName(event.target.value)} autoFocus /><div><button type="submit" disabled={busy || !renameName.trim()}>保存</button><button type="button" disabled={busy} onClick={() => setRenaming(false)}>取消</button></div></form> : <><button disabled={busy} onClick={() => setRenaming(true)}>重命名</button><button className="danger-text" disabled={busy} onClick={() => void handleDelete()}>删除分组</button><button onClick={() => setMenuId(null)}>关闭</button></>}</div>}
        </div>)}{groups.length === 0 && <p className="sidebar-empty">用 ＋ 创建你的第一个分组</p>}</div>
      </section>
    </div>
    <nav className="sidebar-nav sidebar-footer" aria-label="应用工具">{item('settings', '设置', <IconGear />)}</nav>
  </aside>
})
