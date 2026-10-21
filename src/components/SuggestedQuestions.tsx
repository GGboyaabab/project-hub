import { useMemo } from 'react'
import type { KnowledgeBranch } from '../types'
import { followupQuestions, questionKey } from '../followup-questions'

export function SuggestedQuestions({ content, parentId, branches, disabled, onAsk }: {
  content: string
  parentId: string | null
  branches: KnowledgeBranch[]
  disabled: boolean
  onAsk: (quote: string, parentId: string | null, title: string) => void
}) {
  const parsed = useMemo(() => followupQuestions(content), [content])
  if (!parsed.questions.length && parentId !== null) return null
  const quote = (parsed.context || content).trim().split(/\n\s*\n/).filter(Boolean).at(-1)?.slice(0, 2000) || content.slice(0, 2000)
  return <section className="suggested-questions" aria-label="猜你想问" data-parent-id={parentId ?? ''}>
    <div className="suggested-header"><h4>猜你想问</h4><button type="button" className="suggested-own" disabled={disabled || !quote.trim()} onClick={() => onAsk(quote, parentId, '')}>自己提问 ＋</button></div>
    <p>{parsed.questions.length ? '从已有内容延伸，选一个问题继续探索。' : '暂时没有候选问题，也可以从原文提出自己的问题。'}</p>
    <div className="suggested-grid">{parsed.questions.map(question => {
      const exists = branches.some(branch => branch.parentId === parentId && questionKey(branch.title) === questionKey(question))
      return <button type="button" className="suggested-question" key={question} disabled={disabled || exists} onClick={() => onAsk(quote, parentId, question)}><span>{question}</span><small>{exists ? '已建分支' : '继续探索 →'}</small></button>
    })}</div>
    {parsed.questions.length > 0 && <small className="suggested-note">问题仅作启发，点击后可编辑；不会自动调用 AI 或保存分支。</small>}
  </section>
}
