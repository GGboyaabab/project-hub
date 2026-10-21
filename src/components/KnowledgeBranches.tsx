import { useEffect, useRef, useState } from 'react'
import type { KnowledgeBranch } from '../types'
import { followupQuestions } from '../followup-questions'
import { SuggestedQuestions } from './SuggestedQuestions'

const labels = { question: '问题', idea: '想法', explanation: '解释' }

interface Props {
  title: string
  content: string
  branches: KnowledgeBranch[]
  disabled: boolean
  onSave: (branches: KnowledgeBranch[]) => Promise<void>
  onDirtyChange: (dirty: boolean) => void
}

export function KnowledgeBranches({ title, content, branches, disabled, onSave, onDirtyChange }: Props) {
  const [draft, setDraft] = useState<KnowledgeBranch | null>(null)
  const [selection, setSelection] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { onDirtyChange(draft !== null) }, [draft, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  useEffect(() => { if (draft) form.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [draft?.id])

  function start(quote: string, parentId: string | null = null, title = '') {
    if (disabled || busy || generating) return
    if (draft && !window.confirm('放弃尚未保存的分支？')) return
    setDraft({ id: crypto.randomUUID(), parentId, quote: quote.slice(0, 2000), title, kind: 'question', content: '' })
    setError('')
  }
  async function persist(next: KnowledgeBranch[]) {
    setBusy(true); setError('')
    try { await onSave(next); setDraft(null); setSelection('') }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  async function complete() {
    if (!draft || generating) return
    setGenerating(true); setError('')
    try {
      const result = await window.projectHub.completeBranch({ title, quote: draft.quote, question: draft.title, content: draft.content, kind: draft.kind })
      setDraft(current => current ? { ...current, content: result } : null)
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setGenerating(false) }
  }
  function remove(branch: KnowledgeBranch) {
    if (!window.confirm(`删除分支“${branch.title}”及其下所有分支？原文保留。`)) return
    const ids = new Set([branch.id])
    for (let i = 0; i < branches.length; i++) for (const item of branches) if (item.parentId && ids.has(item.parentId)) ids.add(item.id)
    void persist(branches.filter(item => !ids.has(item.id)))
  }
  function tree(parentId: string | null): React.ReactNode[] {
    return branches.filter(branch => branch.parentId === parentId).map(branch => <details className="knowledge-branch" id={`branch-${branch.id}`} key={branch.id} open>
      <summary><span>{labels[branch.kind]}</span><strong>{branch.title}</strong></summary>
      {parentId === null && <button className="text-button branch-back" onClick={() => {
        const index = content ? paragraphs.findIndex(p => p.includes(branch.quote)) : -1
        if (index < 0) { setError('原文已修改，未找到这段引用；引用快照仍保留。'); return }
        document.getElementById(`knowledge-paragraph-${index}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }}>↑ 回到引用原文</button>}
      <blockquote>{branch.quote}</blockquote>
      <div className="branch-content">{followupQuestions(branch.content).body || '暂未补充内容'}</div>
      <SuggestedQuestions content={branch.content} parentId={branch.id} branches={branches} disabled={disabled || busy || generating} onAsk={start} />
      <div className="branch-actions">
        <button type="button" disabled={disabled || busy || !!draft} onClick={() => start(branch.content || branch.title, branch.id)}>继续分支</button>
        <button type="button" disabled={disabled || busy || !!draft} onClick={() => setDraft({ ...branch })}>编辑分支</button>
        <button type="button" disabled={disabled || busy || !!draft} onClick={() => remove(branch)}>删除分支</button>
      </div>
      <div className="branch-children">{tree(branch.id)}</div>
    </details>)
  }
  const paragraphs = followupQuestions(content).body.split(/\n\s*\n/)
  return <div className="knowledge-exploration">
    <div className="branch-toolbar">
      <span>选中正文中的一句话，记录问题、想法或解释 · {branches.length} 个分支</span>
      <button className="secondary-button branch-from-selection" disabled={disabled || busy || generating || !selection} onClick={() => start(selection)}>从选中文字建立分支</button>
    </div>
    <div className="knowledge-body" ref={body} onMouseUp={() => {
      const selected = window.getSelection()
      setSelection(selected && body.current?.contains(selected.anchorNode) && body.current?.contains(selected.focusNode) ? selected.toString().trim().slice(0, 2000) : '')
    }}>
      {paragraphs.map((paragraph, index) => <div className="knowledge-paragraph" key={index} id={`knowledge-paragraph-${index}`}>
        <p>{paragraph || '还没有补充正文，可以点击“编辑”记录内容。'}</p>
        <div className="paragraph-actions"><button type="button" disabled={disabled || busy || generating} onClick={() => start(paragraph)}>＋ 从这段建立分支</button>
          {branches.filter(branch => branch.parentId === null && paragraph.includes(branch.quote) && paragraphs.findIndex(p => p.includes(branch.quote)) === index).map(branch => <a key={branch.id} href={`#branch-${branch.id}`}>↳ {branch.title}</a>)}
        </div>
      </div>)}
    </div>
    <SuggestedQuestions content={content} parentId={null} branches={branches} disabled={disabled || busy || generating} onAsk={start} />
    <section className="knowledge-branches" aria-label="思考分支">
      <h3>思考分支</h3>
      {!branches.length && <p className="branch-hint">阅读时产生的新问题和想法，可以从上面的原文长出分支。</p>}
      {tree(null)}
    </section>
    {error && <p className="knowledge-alert" role="alert">{error}</p>}
    {draft && <form className="branch-form" ref={form} onSubmit={event => { event.preventDefault(); void persist([...branches.filter(branch => branch.id !== draft.id), draft]) }}>
      <fieldset disabled={busy || disabled || generating}>
        <h3>{branches.some(branch => branch.id === draft.id) ? '编辑分支' : '建立分支'}</h3>
        <label>引用原文<textarea className="branch-quote-input" required maxLength={2000} value={draft.quote} onChange={event => setDraft({ ...draft, quote: event.target.value })} /></label>
        <label>分支类型<select className="branch-kind-input" value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as KnowledgeBranch['kind'] })}>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>问题或标题<input className="branch-title-input" autoFocus required maxLength={120} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>解释与思考<textarea className="branch-content-input" rows={8} maxLength={20000} value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} /></label>
        <p className="branch-hint">API 在左侧“设置”中配置。填好问题或想法后让大模型完善，生成结果可修改，点击“保存分支”才写入知识库。</p>
        <p className="branch-writing-hint branch-hint">已启用学习笔记写作规则：问题重在解答，想法重在可行方案，解释重在原理与例子。生成内容仍需核对。</p>
        <button className="secondary-button branch-ai" type="button" disabled={!draft.title.trim() || !draft.quote.trim()} onClick={() => void complete()}>{generating ? 'AI 正在完善…' : 'AI 完善分支'}</button>
        <div className="branch-actions"><button className="primary-button branch-save" type="submit">{busy ? '保存中…' : '保存分支'}</button><button type="button" onClick={() => { if (window.confirm('放弃尚未保存的分支？')) setDraft(null) }}>取消</button></div>
      </fieldset>
    </form>}
  </div>
}
