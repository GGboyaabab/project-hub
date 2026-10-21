import { useEffect, useMemo, useRef, useState } from 'react'
import type { KnowledgeEntry } from '../types'
import { buildKnowledgeGraph, layoutKnowledgeGraph } from '../knowledge-graph'
import type { GraphNode, Point } from '../knowledge-graph'

const labels = { knowledge: '知识', question: '问题', idea: '想法', explanation: '解释', tag: '标签' }

export function KnowledgeGraph({ entries, selectedId, onOpen }: { entries: KnowledgeEntry[]; selectedId: string | null; onOpen: (entryId: string, branchId: string | null) => void }) {
  const [showTags, setShowTags] = useState(true)
  const [localOnly, setLocalOnly] = useState(false)
  const [focus, setFocus] = useState<string | null>(selectedId ? `k:${selectedId}` : null)
  const [hover, setHover] = useState<string | null>(null)
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 })
  const [manual, setManual] = useState<Record<string, Point>>({})
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: string | null; start: Point; origin: Point } | null>(null)
  const moved = useRef(false)
  const scoped = useMemo(() => localOnly ? entries.filter(entry => entry.id === selectedId) : entries, [entries, selectedId, localOnly])
  const graph = useMemo(() => buildKnowledgeGraph(scoped, showTags), [scoped, showTags])
  const layout = useMemo(() => layoutKnowledgeGraph(graph.nodes, graph.edges), [graph])
  const points = { ...layout, ...manual }
  const selected = graph.nodes.find(node => node.id === focus)
  const active = hover ?? selected?.id
  const neighbors = new Set(active ? [active, ...graph.edges.filter(edge => edge.source === active || edge.target === active).flatMap(edge => [edge.source, edge.target])] : [])

  function zoom(factor: number) {
    setCamera(old => {
      const next = Math.max(0.3, Math.min(3, old.zoom * factor))
      const ratio = next / old.zoom
      return { zoom: next, x: 500 - (500 - old.x) * ratio, y: 350 - (350 - old.y) * ratio }
    })
  }
  useEffect(() => {
    const canvas = svg.current
    if (!canvas) return
    const wheel = (event: WheelEvent) => { event.preventDefault(); zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12) }
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => canvas.removeEventListener('wheel', wheel)
  }, [])
  function position(clientX: number, clientY: number) {
    const matrix = svg.current?.getScreenCTM()
    return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : { x: 0, y: 0 }
  }
  function open(node: GraphNode) { if (node.entryId) onOpen(node.entryId, node.branchId) }

  return <div className="knowledge-graph">
    <header className="graph-header"><div><span className="eyebrow">沿着关联继续探索</span><h2>关系图谱</h2><p>{graph.nodes.length} 个节点 · {graph.edges.length} 条关系</p></div><div className="graph-options">
      <label><input className="graph-tags" type="checkbox" checked={showTags} onChange={event => setShowTags(event.target.checked)} />标签节点</label>
      <label><input className="graph-local" type="checkbox" checked={localOnly} onChange={event => setLocalOnly(event.target.checked)} />仅当前知识</label>
    </div></header>
    <div className="graph-stage">
      <svg ref={svg} className="graph-canvas" viewBox="0 0 1000 700" aria-label="知识关系图谱" onPointerDown={event => {
        if (event.button !== 0) return
        moved.current = false
        const start = position(event.clientX, event.clientY)
        const element = (event.target as Element).closest('[data-node-id]')
        const id = element?.getAttribute('data-node-id') ?? null
        drag.current = { id, start, origin: id ? points[id] : { x: camera.x, y: camera.y } }
        event.currentTarget.setPointerCapture(event.pointerId)
      }} onPointerMove={event => {
        const current = drag.current
        if (!current) return
        const next = position(event.clientX, event.clientY), dx = next.x - current.start.x, dy = next.y - current.start.y
        if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true
        if (!moved.current) return
        if (current.id) setManual(old => ({ ...old, [current.id!]: { x: current.origin.x + dx / camera.zoom, y: current.origin.y + dy / camera.zoom } }))
        else setCamera(old => ({ ...old, x: current.origin.x + dx, y: current.origin.y + dy }))
      }} onPointerUp={event => { if (!moved.current && drag.current?.id) setFocus(drag.current.id); drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }} onPointerCancel={() => { drag.current = null }}>
        <g className="graph-transform" transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          {graph.edges.map(edge => <line key={`${edge.kind}:${edge.source}:${edge.target}`} data-edge-kind={edge.kind} className={`graph-edge ${edge.kind} ${active && (edge.source === active || edge.target === active) ? 'highlight' : ''}`} x1={points[edge.source].x} y1={points[edge.source].y} x2={points[edge.target].x} y2={points[edge.target].y} />)}
          {graph.nodes.map(node => <g className={`graph-node ${node.kind} ${focus === node.id ? 'selected' : ''} ${active && !neighbors.has(node.id) ? 'dimmed' : ''}`} key={node.id} data-node-id={node.id} data-node-kind={node.kind} transform={`translate(${points[node.id].x} ${points[node.id].y})`} role="button" tabIndex={0} aria-label={`${labels[node.kind]}：${node.label}`} onPointerEnter={() => setHover(node.id)} onPointerLeave={() => setHover(null)} onClick={() => { if (!moved.current) setFocus(node.id) }} onDoubleClick={() => open(node)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setFocus(node.id) } }}>
            <title>{labels[node.kind]}：{node.label}</title><circle className="node-halo" r={node.kind === 'knowledge' ? 24 : 18} /><circle className="node-core" r={node.kind === 'knowledge' ? 10 : node.kind === 'tag' ? 5 : 7} />
            <text y={node.kind === 'knowledge' ? 32 : 25} textAnchor="middle">{node.label.length > 22 ? node.label.slice(0, 21) + '…' : node.label}</text>
          </g>)}
        </g>
      </svg>
      {!graph.nodes.length && <div className="graph-empty">没有匹配的知识，试着调整左侧搜索与筛选。</div>}
      <div className="graph-zoom"><button aria-label="放大图谱" onClick={() => zoom(1.2)}>＋</button><span>{Math.round(camera.zoom * 100)}%</span><button aria-label="缩小图谱" onClick={() => zoom(1 / 1.2)}>－</button><button className="graph-reset" onClick={() => { setCamera({ x: 0, y: 0, zoom: 1 }); setManual({}) }}>重置</button></div>
      {selected && <div className="graph-preview"><span className={`graph-kind ${selected.kind}`}>{labels[selected.kind]}</span><h3>{selected.label}</h3><p>{selected.content.slice(0, 180) || '暂无正文'}</p>{selected.entryId && <button className="graph-open" onClick={() => open(selected)}>打开{selected.branchId ? '分支' : '知识'} →</button>}</div>}
      <div className="graph-legend">{Object.entries(labels).map(([kind, label]) => <span className={kind} key={kind}><i />{label}</span>)}</div>
    </div>
    <footer className="graph-help">拖动节点调整布局 · 拖动空白平移 · 滚轮缩放 · 点击预览，双击打开内容<br />连线来自分支、共享标签及正文中的 [[知识标题]]。{graph.totalNodes > 400 && '节点较多，仅展示前 400 个，请用搜索或筛选缩小范围。'}</footer>
  </div>
}
