import { memo, useState } from 'react'
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
  onCreate: (name: string) => Promise<boolean>
  onRename: (id: string, name: string) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}

export const Sidebar = memo(function Sidebar({
  root,
  groups,
  filter,
  totalCount,
  favoriteCount,
  archivedCount,
  hiddenCount,
  runningCount,
  knowledgeCount,
  groupCounts,
  onFilter,
  onCreate,
  onRename,
  onDelete,
}: SidebarProps) {
  const [newName, setNewName] = useState('')
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const selectedGroup = filter.kind === 'group' ? groups.find((group) => group.id === filter.groupId) : null

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!newName.trim() || busy) return
    setBusy(true)
    const created = await onCreate(newName)
    if (created) setNewName('')
    setBusy(false)
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault()
    if (!selectedGroup || !renameName.trim() || busy) return
    setBusy(true)
    const renamed = await onRename(selectedGroup.id, renameName)
    if (renamed) setRenaming(false)
    setBusy(false)
  }

  async function handleDelete() {
    if (!selectedGroup || busy) return
    if (!window.confirm(`删除分组“${selectedGroup.name}”？项目文件和收藏设置不会删除。`)) return
    setBusy(true)
    await onDelete(selectedGroup.id)
    setBusy(false)
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Logo size={42} /></div>
        <div>
          <strong>项目中台</strong>
          <span>Project Hub</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="项目视图">
        <button className={filter.kind === 'all' ? 'active' : ''} onClick={() => onFilter({ kind: 'all' })}>
          <IconGrid /><span>全部项目</span><b>{totalCount}</b>
        </button>
        <button className={filter.kind === 'favorite' ? 'active' : ''} onClick={() => onFilter({ kind: 'favorite' })}>
          <IconStar /><span>我的收藏</span><b>{favoriteCount}</b>
        </button>
        <button className={filter.kind === 'running' ? 'active' : ''} onClick={() => onFilter({ kind: 'running' })}>
          <IconBolt /><span>运行中</span><b>{runningCount}</b>
        </button>
        <button className={filter.kind === 'archived' ? 'active' : ''} onClick={() => onFilter({ kind: 'archived' })}>
          <IconArchive /><span>已归档</span><b>{archivedCount}</b>
        </button>
        <button className={filter.kind === 'hidden' ? 'active' : ''} onClick={() => onFilter({ kind: 'hidden' })}>
          <IconEyeOff /><span>已隐藏</span><b>{hiddenCount}</b>
        </button>
        <button className={`knowledge-nav ${filter.kind === 'knowledge' ? 'active' : ''}`} onClick={() => onFilter({ kind: 'knowledge' })}>
          <IconBook /><span>知识广场</span><b>{knowledgeCount}</b>
        </button>
        <button className={`settings-nav ${filter.kind === 'settings' ? 'active' : ''}`} onClick={() => onFilter({ kind: 'settings' })}>
          <IconGear /><span>设置</span>
        </button>
      </nav>

      <div className="group-section">
        <div className="section-caption">项目分组 <span>{groups.length}</span></div>
        <div className="group-list">
          {groups.map((group) => (
            <button
              key={group.id}
              className={selectedGroup?.id === group.id ? 'active' : ''}
              onClick={() => {
                onFilter({ kind: 'group', groupId: group.id })
                setRenameName(group.name)
                setRenaming(false)
              }}
            >
              <IconFolder size={13} /><span>{group.name}</span><b>{groupCounts[group.id] ?? 0}</b>
            </button>
          ))}
          {groups.length === 0 && <p className="sidebar-empty">还没有分组，从下方创建。</p>}
        </div>

        {selectedGroup && (
          <div className="group-actions">
            {!renaming ? (
              <>
                <button onClick={() => setRenaming(true)}>重命名</button>
                <button className="danger-text" onClick={() => void handleDelete()}>删除分组</button>
              </>
            ) : (
              <form onSubmit={(event) => void handleRename(event)}>
                <input value={renameName} maxLength={30} onChange={(event) => setRenameName(event.target.value)} autoFocus />
                <div>
                  <button type="submit" disabled={busy}>保存</button>
                  <button type="button" onClick={() => setRenaming(false)}>取消</button>
                </div>
              </form>
            )}
          </div>
        )}

        <form className="new-group-form" onSubmit={(event) => void handleCreate(event)}>
          <input
            value={newName}
            maxLength={30}
            placeholder="新分组名称"
            aria-label="新分组名称"
            onChange={(event) => setNewName(event.target.value)}
          />
          <button type="submit" disabled={busy || !newName.trim()}><IconPlus size={13} />新建</button>
        </form>
      </div>

      <div className="managed-root">
        <span>管理目录</span>
        <code title={root}>{root}</code>
      </div>
    </aside>
  )
})
