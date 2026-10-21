import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { HubState, KnowledgeBranch, KnowledgeDraft, KnowledgeEntry, KnowledgeKind, Project } from '../types'
import { KnowledgeBranches } from './KnowledgeBranches'
import { KnowledgeGraph } from './KnowledgeGraph'
import { formatModified, itemTypeLabels } from '../utils'
import { IconEdit, IconPin, IconPlus, IconTrash } from './icons'

const kindLabels: Record<KnowledgeKind, string> = { note: '笔记', link: '网页', file: '文件' }
const newDraft = (): KnowledgeDraft => ({ title: '', kind: 'note', category: '', tags: [], content: '', target: '', projectPath: null, pinned: false })
const projectLabel = (project: Project) => project.parentPath ? `${project.parentPath.split(/[\\/]/).pop()} / ${project.name}` : project.name

interface Props {
  state: HubState
  onState: (state: HubState) => void
  onDirtyChange: (dirty: boolean) => void
  onViewProject: (project: Project) => void
}

export function KnowledgeSquare({ state, onState, onDirtyChange, onViewProject }: Props) {
  const [tab, setTab] = useState<'knowledge' | 'projects'>('knowledge')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [kind, setKind] = useState<KnowledgeKind | 'all'>('all')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<KnowledgeDraft | null>(null)
  const [tags, setTags] = useState('')
  const [dirty, setDirty] = useState(false)
  const [branchDirty, setBranchDirty] = useState(false)
  const [view, setView] = useState<'reading' | 'graph'>('reading')
  const [pendingBranch, setPendingBranch] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const selected = state.knowledge.find(entry => entry.id === selectedId) ?? null
  const linkedProject = state.projects.find(project => project.path === selected?.projectPath)
  const categories = useMemo(() => [...new Set(state.knowledge.map(entry => entry.category))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [state.knowledge])
  const query = search.trim().toLowerCase()
  const visible = state.knowledge.filter(entry =>
    (category === 'all' || entry.category === category) &&
    (kind === 'all' || entry.kind === kind) &&
    (!pinnedOnly || entry.pinned) &&
    (!query || [entry.title, entry.content, entry.category, entry.target, entry.projectPath, ...entry.tags, ...(entry.branches ?? []).flatMap(branch => [branch.title, branch.quote, branch.content])].join(' ').toLowerCase().includes(query)),
  )
  const resources = state.projects.filter(project => project.itemType !== 'app' && project.visibility === 'active' &&
    (!query || [projectLabel(project), project.description, project.notes, ...project.tags].join(' ').toLowerCase().includes(query)))

  useEffect(() => { onDirtyChange(dirty || branchDirty) }, [dirty, branchDirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  useEffect(() => {
    if (!pendingBranch || view !== 'reading') return
    const frame = requestAnimationFrame(() => {
      document.getElementById(`branch-${pendingBranch}`)?.scrollIntoView({ block: 'start' })
      setPendingBranch(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [pendingBranch, view, selectedId])
  useEffect(() => {
    if (!dirty && !branchDirty) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty, branchDirty])
  useEffect(() => {
    if (!state.knowledge.some(entry => entry.id === selectedId)) setSelectedId(state.knowledge[0]?.id ?? null)
  }, [state.knowledge, selectedId])
  useEffect(() => {
    if (category !== 'all' && !categories.includes(category)) setCategory('all')
  }, [category, categories])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4500)
    return () => clearTimeout(timer)
  }, [notice])

  function discard() { return !(dirty || branchDirty) || window.confirm('当前知识条目或分支尚未保存，放弃这些修改？') }
  function report(error: unknown) { setNotice({ error: true, text: error instanceof Error ? error.message : String(error) }) }
  function update(patch: Partial<KnowledgeDraft>) { setDraft(current => current ? { ...current, ...patch } : null); setDirty(true) }
  function edit(entry?: KnowledgeEntry) {
    if (!discard()) return
    setView('reading')
    setDraft(entry ? { ...entry, tags: [...entry.tags] } : newDraft())
    setTags(entry?.tags.join(', ') ?? '')
    setDirty(false)
  }
  function select(entry: KnowledgeEntry) {
    if (!discard()) return
    setView('reading')
    setSelectedId(entry.id)
    setDraft(null)
    setDirty(false)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || busy) return
    setBusy(true)
    try {
      const result = await window.projectHub.saveKnowledge({ ...draft, tags: tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean) })
      onState(result.state)
      setSelectedId(result.id)
      setDraft(null)
      setDirty(false)
      setSearch(''); setCategory('all'); setKind('all'); setPinnedOnly(false); setTab('knowledge')
      setNotice({ error: false, text: '知识已保存' })
    } catch (error) { report(error) }
    finally { setBusy(false) }
  }

  async function remove() {
    if (!selected || busy || !window.confirm(`删除知识条目“${selected.title}”？关联项目和原始文件会保留。`)) return
    setBusy(true)
    try {
      onState(await window.projectHub.deleteKnowledge(selected.id))
      setNotice({ error: false, text: '知识条目已删除' })
    } catch (error) { report(error) }
    finally { setBusy(false) }
  }

  async function saveBranches(branches: KnowledgeBranch[]) {
    if (!selected || busy) throw new Error('请稍后重试')
    setBusy(true)
    try {
      onState((await window.projectHub.saveKnowledge({ ...selected, branches })).state)
      setNotice({ error: false, text: '思考分支已保存' })
    } finally { setBusy(false) }
  }

  async function togglePin() {
    if (!selected || busy) return
    setBusy(true)
    try { onState((await window.projectHub.saveKnowledge({ ...selected, pinned: !selected.pinned })).state) }
    catch (error) { report(error) }
    finally { setBusy(false) }
  }

  async function chooseFile() {
    try {
      const file = await window.projectHub.chooseKnowledgeFile()
      if (file) update({ target: file })
    } catch (error) { report(error) }
  }

  async function openSource() {
    if (!selected) return
    try { await window.projectHub.openKnowledge(selected.id) }
    catch (error) { report(error) }
  }

  return <section className="knowledge-square">
    <aside className="knowledge-main" aria-label="知识列表">
      <header className="knowledge-header">
        <div><span className="eyebrow">记录 · 整理 · 复用</span><h1>知识广场</h1><p>把项目经验、学习笔记与参考资料集中收好。</p></div>
        <button className="primary-button knowledge-new" disabled={!!state.knowledgeError || busy} onClick={() => edit()}><IconPlus size={14} />新建知识</button>
      </header>
      {state.knowledgeError && <div className="knowledge-alert" role="alert">{state.knowledgeError}</div>}
      <div className="knowledge-stats">
        <div><strong>{state.knowledge.length}</strong><span>知识条目</span></div>
        <div><strong>{state.knowledge.filter(entry => entry.pinned).length}</strong><span>置顶收藏</span></div>
        <div><strong>{categories.length}</strong><span>知识分类</span></div>
      </div>
      <div className="knowledge-tabs" role="tablist" aria-label="知识来源">
        <button role="tab" aria-selected={tab === 'knowledge'} onClick={() => setTab('knowledge')}>我的知识</button>
        <button role="tab" aria-selected={tab === 'projects'} onClick={() => setTab('projects')}>项目资料</button>
      </div>
      <div className="knowledge-toolbar">
        <input className="knowledge-search" aria-label="搜索知识" placeholder={tab === 'knowledge' ? '搜索标题、正文、分类、标签或关联项目' : '搜索项目资料'} value={search} onChange={event => setSearch(event.target.value)} />
        {tab === 'knowledge' && <>
          <select className="knowledge-category-filter" aria-label="知识分类筛选" value={category} onChange={event => setCategory(event.target.value)}>
            <option value="all">全部分类</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="knowledge-kind-filter" aria-label="知识类型筛选" value={kind} onChange={event => setKind(event.target.value as KnowledgeKind | 'all')}>
            <option value="all">全部类型</option>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button className={`knowledge-pinned-filter ${pinnedOnly ? 'active' : ''}`} aria-pressed={pinnedOnly} onClick={() => setPinnedOnly(value => !value)}>只看置顶</button>
        </>}
      </div>
      <div className="knowledge-feed">
        {tab === 'knowledge' ? <>
          <p className="knowledge-result-count">{visible.length} 条知识 · 保存在本机</p>
          <div className="knowledge-grid">
            {visible.map(entry => <button key={entry.id} className={`knowledge-card ${selectedId === entry.id ? 'selected' : ''}`} onClick={() => select(entry)}>
              <div className="knowledge-card-top"><span className={`knowledge-kind ${entry.kind}`}>{kindLabels[entry.kind]}</span><span>{entry.pinned ? '★ 已置顶' : entry.category}</span></div>
              <h2>{entry.title}</h2>
              <p className="knowledge-summary">{entry.content || entry.target || '点击查看这条知识'}</p>
              <div className="chip-row">{entry.tags.map(tag => <span className="chip tag" key={tag}>{tag}</span>)}</div>
              <div className="knowledge-card-footer"><span>{entry.category}</span><time>{formatModified(entry.updatedAt)}</time></div>
            </button>)}
          </div>
          {!visible.length && <div className="knowledge-empty"><div className="knowledge-empty-symbol">知</div><h2>{state.knowledge.length ? '没有找到相关知识' : '从一条笔记开始积累'}</h2><p>{state.knowledge.length ? '调整搜索内容或筛选条件。' : '记录实验结论、面试要点，或收集有用的链接和本机资料。'}</p>{!state.knowledge.length && <button className="primary-button" disabled={!!state.knowledgeError} onClick={() => edit()}>新建第一条知识</button>}</div>}
        </> : <>
          <p className="knowledge-result-count">{resources.length} 个资料目录 · 来自中台的源码、数据集与资料</p>
          <div className="knowledge-grid">
            {resources.map(project => <button className="knowledge-card resource-card" key={project.path} onClick={() => { if (discard()) onViewProject(project) }}>
              <div className="knowledge-card-top"><span className="knowledge-kind file">{itemTypeLabels[project.itemType]}</span><span>项目资料</span></div>
              <h2>{projectLabel(project)}</h2><p className="knowledge-summary">{project.notes || project.description || '查看目录详情，补充分类与用途。'}</p>
              <div className="chip-row">{project.tags.map(tag => <span className="chip tag" key={tag}>{tag}</span>)}</div>
              <div className="knowledge-card-footer"><span>查看项目详情 →</span></div>
            </button>)}
          </div>
          {!resources.length && <div className="knowledge-empty"><h2>没有匹配的项目资料</h2><p>源码、数据集和资料条目会自动显示在这里。</p></div>}
        </>}
      </div>
    </aside>

    <main className="knowledge-detail" aria-label="知识内容">
      <div className="knowledge-view-switch" role="tablist" aria-label="知识视图">
        <button className="knowledge-reading-tab" role="tab" aria-selected={view === 'reading'} onClick={() => setView('reading')}>正文阅读</button>
        <button className="knowledge-graph-tab" role="tab" aria-selected={view === 'graph'} onClick={() => { if (discard()) { setDraft(null); setDirty(false); setView('graph') } }}>关系图谱</button>
      </div>
      {view === 'graph' ? <KnowledgeGraph entries={visible} selectedId={selectedId} onOpen={(entryId, branchId) => { setSelectedId(entryId); setView('reading'); setPendingBranch(branchId) }} /> : draft ? <>
        <div className="knowledge-detail-header"><span className="eyebrow">{draft.id ? '编辑知识' : '新增知识'}</span><h2>{draft.id ? '完善你的记录' : '留住一个有用的发现'}</h2></div>
        <form className="knowledge-form" onSubmit={event => void save(event)}>
          <fieldset disabled={busy}>
            <label><span>标题</span><input className="knowledge-title-input" value={draft.title} maxLength={120} required placeholder="例如：毕设数据预处理流程" onChange={event => update({ title: event.target.value })} /></label>
            <div className="knowledge-form-row">
              <label><span>类型</span><select className="knowledge-kind-input" value={draft.kind} onChange={event => update({ kind: event.target.value as KnowledgeKind, target: '' })}>{Object.entries(kindLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>分类</span><input className="knowledge-category-input" list="knowledge-category-options" maxLength={30} placeholder="例如：毕业设计" value={draft.category} onChange={event => update({ category: event.target.value })} /></label>
            </div>
            <datalist id="knowledge-category-options">{[...new Set([...categories, ...state.groups.map(group => group.name), '开发实践', '学习笔记'])].map(value => <option key={value} value={value} />)}</datalist>
            {draft.kind !== 'note' && <label><span>{draft.kind === 'link' ? '网页地址' : '本机文件路径'}</span><input className="knowledge-target-input" required value={draft.target} maxLength={4096} placeholder={draft.kind === 'link' ? 'https://example.com/article' : '选择文件或填写完整路径'} onChange={event => update({ target: event.target.value })} />{draft.kind === 'file' && <button className="secondary-button knowledge-pick-file" type="button" onClick={() => void chooseFile()}>选择文件</button>}</label>}
            <label><span>标签</span><input className="knowledge-tags-input" value={tags} placeholder="用逗号分隔，最多 8 个" onChange={event => { setTags(event.target.value); setDirty(true) }} /></label>
            <label><span>关联项目</span><select className="knowledge-project-input" value={draft.projectPath ?? ''} onChange={event => update({ projectPath: event.target.value || null })}>
              <option value="">不关联项目</option>
              {draft.projectPath && !state.projects.some(project => project.path === draft.projectPath) && <option value={draft.projectPath}>原关联项目暂不在扫描结果中</option>}
              {state.projects.map(project => <option value={project.path} key={project.path}>{projectLabel(project)}{project.visibility !== 'active' ? `（${project.visibility === 'hidden' ? '已隐藏' : '已归档'}）` : ''}</option>)}
            </select></label>
            <label><span>{draft.kind === 'note' ? '笔记正文' : '摘要与心得'}</span><textarea className="knowledge-content-input" value={draft.content} maxLength={20000} rows={9} placeholder="记录关键信息、操作步骤与自己的理解……" onChange={event => update({ content: event.target.value })} /></label>
            <label className="knowledge-pin-label"><input type="checkbox" checked={draft.pinned} onChange={event => update({ pinned: event.target.checked })} /><span>置顶，方便下次查找</span></label>
            <div className="knowledge-form-actions"><button className="primary-button knowledge-save" type="submit">{busy ? '保存中…' : '保存知识'}</button><button type="button" className="secondary-button knowledge-cancel" onClick={() => { if (discard()) { setDraft(null); setDirty(false) } }}>取消</button></div>
          </fieldset>
        </form>
      </> : selected ? <>
        <div className="knowledge-detail-header"><span className={`knowledge-kind ${selected.kind}`}>{kindLabels[selected.kind]}</span><h2>{selected.title}</h2><p>{selected.category} · 更新于 {formatModified(selected.updatedAt)}</p></div>
        <div className="knowledge-reading">
          <div className="knowledge-entry-actions"><button className="secondary-button knowledge-edit" disabled={busy || !!state.knowledgeError} onClick={() => edit(selected)}><IconEdit size={13} />编辑</button><button className="secondary-button knowledge-pin" disabled={busy || !!state.knowledgeError} onClick={() => void togglePin()}><IconPin size={13} />{selected.pinned ? '取消置顶' : '置顶'}</button><button className="text-button danger-text knowledge-delete" disabled={busy || !!state.knowledgeError} onClick={() => void remove()}><IconTrash size={13} />删除</button></div>
          <div className="chip-row">{selected.tags.map(tag => <span className="chip tag" key={tag}>{tag}</span>)}</div>
          {selected.target && <div className="knowledge-source"><span>资料来源</span><code>{selected.target}</code><button className="text-button knowledge-open-source" onClick={() => void openSource()}>{selected.kind === 'link' ? '在浏览器打开' : '在文件夹中定位'}</button></div>}
          {selected.projectPath && <div className="knowledge-source"><span>关联项目</span><code>{linkedProject ? projectLabel(linkedProject) : selected.projectPath}</code>{linkedProject ? <button className="text-button knowledge-open-project" onClick={() => onViewProject(linkedProject)}>查看项目详情</button> : <small>该项目已收起或不在当前扫描结果中，关联信息已保留。</small>}</div>}
          <KnowledgeBranches key={selected.id} title={selected.title} content={selected.content} branches={selected.branches ?? []} disabled={busy || !!state.knowledgeError} onSave={saveBranches} onDirtyChange={setBranchDirty} />
        </div>
      </> : <div className="knowledge-detail-empty"><div className="knowledge-empty-symbol">知</div><h2>让知识留得住、找得到</h2><p>选择一条知识查看内容，或创建你的第一条笔记。</p><small>文件条目保存引用路径，原文件仍在原来的位置。</small></div>}
    </main>
    {notice && <div className={`toast ${notice.error ? 'error' : 'success'}`} role="status">{notice.text}</div>}
  </section>
}
