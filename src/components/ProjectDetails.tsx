import { memo, useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { ItemType, Project, ProjectGroup, ProjectPatch, SizeResult } from '../types'
import { formatBytes, itemTypeLabels, runtimeLabels } from '../utils'
import { LogPanel } from './LogPanel'
import { IconFolder, IconGauge, IconGear, IconStar, IconStarFill } from './icons'
import { Logo } from './Logo'

interface ProjectDetailsProps {
  project: Project | null
  groups: ProjectGroup[]
  onUpdate: (projectPath: string, patch: ProjectPatch) => Promise<boolean>
  onStartStop: (project: Project, command?: string) => Promise<unknown>
  onClearLogs: (projectPath: string) => Promise<unknown>
  onCalculateSize: (projectPath: string) => Promise<SizeResult | null>
  onOpenFolder: (projectPath: string) => Promise<unknown>
}

export const ProjectDetails = memo(function ProjectDetails({
  project,
  groups,
  onUpdate,
  onStartStop,
  onClearLogs,
  onCalculateSize,
  onOpenFolder,
}: ProjectDetailsProps) {
  const [groupId, setGroupId] = useState('')
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [command, setCommand] = useState('')
  const [itemType, setItemType] = useState<ItemType>('document')
  const [saving, setSaving] = useState(false)
  const [sizeLoading, setSizeLoading] = useState(false)
  const [size, setSize] = useState<SizeResult | null>(null)

  useEffect(() => {
    setTags(project?.tags.join(', ') ?? '')
    setNotes(project?.notes ?? '')
    setCommand(project?.command ?? '')
    setSize(null)
  }, [project?.path])

  useEffect(() => {
    setGroupId(project?.groupId ?? '')
  }, [project?.path, project?.groupId])

  useEffect(() => {
    setItemType(project?.itemType ?? 'document')
  }, [project?.path, project?.itemType])

  const projectPath = project?.path ?? ''
  const handleClearLogs = useCallback(() => onClearLogs(projectPath), [onClearLogs, projectPath])

  if (!project) {
    return (
      <aside className="details-panel empty-details">
        <div className="empty-illustration"><Logo size={64} /></div>
        <h2>选择一个项目</h2>
        <p>查看项目信息、编辑配置并管理运行进程。</p>
      </aside>
    )
  }

  const active = ['running', 'stopping'].includes(project.runtime.status)

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    await onUpdate(projectPath, {
      groupId: groupId || null,
      tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
      notes,
      command,
      itemType,
    })
    setSaving(false)
  }

  async function handleCalculateSize() {
    setSizeLoading(true)
    const result = await onCalculateSize(projectPath)
    if (result) setSize(result)
    setSizeLoading(false)
  }

  return (
    <aside className="details-panel">
      <div className="details-header">
        <div>
          <span className={`runtime-badge ${project.runtime.status}`}>{project.itemType === 'app' ? runtimeLabels[project.runtime.status] : itemTypeLabels[project.itemType]}</span>
          <h2>{project.name}</h2>
        </div>
        <button
          className={`favorite-button ${project.favorite ? 'active' : ''}`}
          onClick={() => void onUpdate(project.path, { favorite: !project.favorite })}
        >
          {project.favorite ? <IconStarFill size={12} /> : <IconStar size={12} />}
          {project.favorite ? '取消收藏' : '收藏项目'}
        </button>
      </div>

      <div className="details-scroll">
        <div className="details-path">
          <span>项目位置</span>
          <code title={project.path}>{project.path}</code>
          <button className="text-button" onClick={() => void onOpenFolder(project.path)}>打开文件夹</button>
        </div>

        <section className="detail-section">
          <div className="detail-section-heading"><span className="section-icon"><IconGear size={14} /></span><h3>项目配置</h3></div>
          <form className="project-form" onSubmit={(event) => void handleSave(event)}>
            <label>
              <span>所属分组</span>
              <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                <option value="">未分组</option>
                {groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}
              </select>
            </label>
            <label>
              <span>条目类型</span>
              <select className="item-type-select" value={itemType} disabled={active} onChange={(event) => setItemType(event.target.value as ItemType)}>
                {Object.entries(itemTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <small>应用可配置启动命令；源码、数据集和资料通过目录访问。</small>
            </label>
            <label>
              <span>标签</span>
              <input value={tags} placeholder="工作, 后端, 实验" onChange={(event) => setTags(event.target.value)} />
              <small>使用逗号分隔，最多保存 8 个标签。</small>
            </label>
            <label>
              <span>备注</span>
              <textarea value={notes} rows={3} maxLength={2000} placeholder="记录项目用途、注意事项或访问地址" onChange={(event) => setNotes(event.target.value)} />
            </label>
            {itemType === 'app' && <label>
              <span>启动命令</span>
              <input value={command} placeholder="例如 npm run dev" onChange={(event) => setCommand(event.target.value)} />
              <small>命令将在项目根目录执行。</small>
            </label>}
            <button className="save-button" type="submit" disabled={saving}>{saving ? '保存中…' : '保存配置'}</button>
          </form>
        </section>

        <section className="detail-section organization-section">
          <div className="detail-section-heading"><span className="section-icon hot"><IconFolder size={14} /></span><h3>目录管理</h3></div>
          {!project.parentPath && <label className="expand-children">
            <input type="checkbox" checked={project.expanded} disabled={active} onChange={(event) => void onUpdate(project.path, { expanded: event.target.checked })} />
            <span>展开下一层目录为独立条目</span>
          </label>}
          <div className="organization-actions">
            {project.visibility === 'active' ? <>
              <button className="secondary-button archive-button" disabled={active} onClick={() => void onUpdate(project.path, { visibility: 'archived' })}>归档</button>
              <button className="secondary-button hide-button" disabled={active} onClick={() => void onUpdate(project.path, { visibility: 'hidden' })}>隐藏</button>
            </> : <button className="secondary-button restore-button" onClick={() => void onUpdate(project.path, { visibility: 'active' })}>恢复到日常视图</button>}
          </div>
          <p className="organization-help">归档与隐藏仅调整中台视图，文件保留在原目录；可从左侧入口恢复。</p>
        </section>

        <section className="detail-section process-section">
          <div className="detail-section-heading"><span className="section-icon cool"><IconGauge size={14} /></span><h3>{project.itemType === 'app' ? '进程控制' : '目录统计'}</h3>{project.runtime.pid && <span>PID {project.runtime.pid}</span>}</div>
          <div className="process-actions">
            {project.itemType === 'app' && project.visibility === 'active' && <button
              className={active ? 'stop-button' : 'primary-button'}
              disabled={project.runtime.status === 'stopping'}
              onClick={() => void onStartStop(project, command)}
            >
              {project.runtime.status === 'running' ? '停止项目' : project.runtime.status === 'stopping' ? '正在停止' : '启动项目'}
            </button>}
            <button className="secondary-button" disabled={sizeLoading} onClick={() => void handleCalculateSize()}>
              {sizeLoading ? '统计中…' : '计算目录大小'}
            </button>
          </div>
          {size && <p className="size-result">{size.truncated ? '已统计大小（达到文件数上限）' : '目录大小（不含依赖与构建目录）'}：<strong>{formatBytes(size.bytes)}</strong></p>}
        </section>

        {project.itemType === 'app' && <LogPanel logs={project.runtime.logs} onClear={handleClearLogs} />}
      </div>
    </aside>
  )
})
