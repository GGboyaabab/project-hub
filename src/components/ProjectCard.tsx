import { memo } from 'react'
import type { Project, ProjectGroup } from '../types'
import { formatModified, itemTypeLabels, runtimeLabels } from '../utils'
import { IconFolder, IconInfo, IconPlay, IconStar, IconStarFill, IconStop } from './icons'

interface ProjectCardProps {
  project: Project
  groups: ProjectGroup[]
  selected: boolean
  onSelect: (projectPath: string) => void
  onToggleFavorite: (project: Project) => Promise<unknown>
  onStartStop: (project: Project) => Promise<unknown>
  onOpenFolder: (projectPath: string) => Promise<unknown>
}

export const ProjectCard = memo(function ProjectCard({ project, groups, selected, onSelect, onToggleFavorite, onStartStop, onOpenFolder }: ProjectCardProps) {
  const group = groups.find((item) => item.id === project.groupId)
  const active = ['running', 'stopping'].includes(project.runtime.status)

  return (
    <article className={`project-card ${selected ? 'selected' : ''}`} onClick={() => onSelect(project.path)}>
      <div className="project-card-header">
        <div className="project-title-row">
          <span className={`status-dot ${project.runtime.status}`} />
          <h3>{project.name}</h3>
        </div>
        <button
          className={`favorite-button ${project.favorite ? 'active' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            void onToggleFavorite(project)
          }}
        >
          {project.favorite ? <IconStarFill size={12} /> : <IconStar size={12} />}
          {project.favorite ? '已收藏' : '收藏'}
        </button>
      </div>

      {project.parentPath && <p className="project-parent">来自 {project.parentPath.split(/[\\/]/).pop()}</p>}
      <p className="project-description">{project.description || project.notes || '暂无条目简介'}</p>
      <div className="chip-row">
        <span className={`chip item-type ${project.itemType}`}>{itemTypeLabels[project.itemType]}</span>
        {project.stack.length ? project.stack.map((item) => <span className="chip" key={item}>{item}</span>) : ['app', 'source'].includes(project.itemType) && <span className="chip muted">未识别技术栈</span>}
        {project.tags.map((tag) => <span className="chip tag" key={tag}>{tag}</span>)}
      </div>

      <div className="project-meta">
        <span>{group?.name || '未分组'}</span>
        <span>{formatModified(project.modifiedAt)}</span>
        <span className={`runtime-text ${project.runtime.status}`}>{project.itemType === 'app' ? runtimeLabels[project.runtime.status] : project.visibility === 'archived' ? '已归档' : project.visibility === 'hidden' ? '已隐藏' : '本地目录'}</span>
      </div>

      <div className="project-card-actions">
        <button className="secondary-button" onClick={(event) => { event.stopPropagation(); onSelect(project.path) }}><IconInfo size={13} />查看详情</button>
        {project.itemType === 'app' && project.visibility === 'active' ? <button
          className={active ? 'stop-button' : 'primary-button'}
          disabled={project.runtime.status === 'stopping'}
          onClick={(event) => {
            event.stopPropagation()
            void onStartStop(project)
          }}
        >
          {project.runtime.status === 'running' ? <><IconStop size={11} />停止</> : project.runtime.status === 'stopping' ? '停止中' : <><IconPlay size={11} />启动</>}
        </button> : <button className="primary-button" onClick={(event) => { event.stopPropagation(); void onOpenFolder(project.path) }}><IconFolder size={13} />打开目录</button>}
      </div>
    </article>
  )
})
