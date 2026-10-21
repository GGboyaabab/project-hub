import { memo, useEffect, useMemo, useRef } from 'react'
import type { LogEntry } from '../types'
import { IconTerminal } from './icons'

interface LogPanelProps {
  logs: LogEntry[]
  onClear: () => Promise<unknown>
}

const LogRow = memo(function LogRow({ entry }: { entry: LogEntry }) {
  const time = useMemo(
    () => new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false }),
    [entry.timestamp],
  )
  return (
    <div className={`log-entry ${entry.stream}`}>
      <time>{time}</time>
      <pre>{entry.text}</pre>
    </div>
  )
})

export const LogPanel = memo(function LogPanel({ logs, onClear }: LogPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)

  useEffect(() => {
    const container = containerRef.current
    if (container && stickToBottomRef.current) container.scrollTop = container.scrollHeight
  }, [logs])

  function handleScroll() {
    const container = containerRef.current
    if (!container) return
    stickToBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 40
  }

  return (
    <section className="log-section">
      <div className="detail-section-heading">
        <span className="section-icon hot"><IconTerminal size={14} /></span>
        <h3>运行日志</h3>
        <button className="text-button" onClick={() => void onClear()} disabled={!logs.length}>清空</button>
      </div>
      <div className="log-viewer" ref={containerRef} onScroll={handleScroll}>
        {logs.length === 0 ? (
          <div className="log-empty">启动项目后，这里会显示标准输出和错误输出。</div>
        ) : (
          logs.map((entry) => <LogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </section>
  )
})
