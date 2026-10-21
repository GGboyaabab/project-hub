export function followupQuestions(content: string): { body: string; context: string; questions: string[] } {
  const marker = /^(?:#{1,6}[ \t]*)?(?:可继续追问|接着可以追问|猜你想问)[：:]?[ \t]*([^\n]*)$/gm
  const matches = [...content.matchAll(marker)]
  const heading = matches.at(-1)
  if (!heading) return { body: content, context: content, questions: [] }
  const context = content.slice(0, heading.index).trimEnd()
  const tail = content.slice(heading.index! + heading[0].length - heading[1].length)
  const questions: string[] = []
  let onlyQuestions = true
  for (const line of tail.split(/\r?\n/)) {
    const cleaned = line.trim().replace(/^(?:[-*•]\s*|\d+[.、)）]\s*)/, '')
    if (!cleaned) continue
    if (/^(?:#{1,6}\s+|来源[：:]|参考|资料说明|原视频[：:])/.test(cleaned)) { onlyQuestions = false; break }
    const found = cleaned.match(/[^?？]+[?？]/g) ?? []
    if (!found.length || cleaned.slice(cleaned.lastIndexOf(found.at(-1) ?? '') + (found.at(-1)?.length ?? 0)).trim()) onlyQuestions = false
    for (const question of found) {
      const value = question.trim().replace(/^(?:[-*•]\s*|\d+[.、)）]\s*)/, '')
      if (value.length < 4 || value.length > 120 || /https?:\/\//i.test(value)) { onlyQuestions = false; continue }
      if (!questions.some(item => questionKey(item) === questionKey(value))) questions.push(value)
    }
  }
  // Keep mixed prose and sources intact; only replace a clean, short question suffix with cards.
  const body = onlyQuestions && questions.length > 0 && questions.length <= 3 ? content.slice(0, heading.index).trimEnd() : content
  return { body, context, questions: questions.slice(0, 3) }
}

export function questionKey(question: string) { return question.trim().replace(/[?？]$/, '').replace(/\s+/g, '').toLowerCase() }
