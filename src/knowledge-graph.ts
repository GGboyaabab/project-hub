import type { KnowledgeEntry } from './types'

export interface GraphNode {
  id: string
  label: string
  kind: 'knowledge' | 'question' | 'idea' | 'explanation' | 'tag'
  entryId: string | null
  branchId: string | null
  content: string
}
export interface GraphEdge { source: string; target: string; kind: 'branch' | 'tag' | 'link' }
export interface Point { x: number; y: number }

export function buildKnowledgeGraph(entries: KnowledgeEntry[], showTags = true) {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const tags = new Set<string>()
  const titles = new Map<string, KnowledgeEntry[]>()
  for (const entry of entries) titles.set(entry.title, [...(titles.get(entry.title) ?? []), entry])
  for (const entry of entries) {
    const root = `k:${entry.id}`
    nodes.push({ id: root, label: entry.title, kind: 'knowledge', entryId: entry.id, branchId: null, content: entry.content })
    for (const branch of entry.branches ?? []) {
      const id = `b:${entry.id}:${branch.id}`
      nodes.push({ id, label: branch.title, kind: branch.kind, entryId: entry.id, branchId: branch.id, content: branch.content })
      edges.push({ source: branch.parentId ? `b:${entry.id}:${branch.parentId}` : root, target: id, kind: 'branch' })
    }
    if (showTags) for (const tag of new Set(entry.tags)) {
      const id = `t:${tag}`
      if (!tags.has(tag)) { tags.add(tag); nodes.push({ id, label: tag, kind: 'tag', entryId: null, branchId: null, content: '共享此标签的知识通过这个节点关联。' }) }
      edges.push({ source: root, target: id, kind: 'tag' })
    }
    for (const match of entry.content.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
      const title = match[1].split('|')[0].trim()
      const targets = titles.get(title)
      // Duplicate titles are ambiguous; avoid inventing a relationship.
      if (targets?.length === 1 && targets[0].id !== entry.id) edges.push({ source: root, target: `k:${targets[0].id}`, kind: 'link' })
    }
  }
  const totalNodes = nodes.length
  const shown = nodes.slice(0, 400)
  const ids = new Set(shown.map(node => node.id))
  const seen = new Set<string>()
  return { nodes: shown, totalNodes, edges: edges.filter(edge => {
    const key = `${edge.kind}:${JSON.stringify([edge.source, edge.target].sort())}`
    if (!ids.has(edge.source) || !ids.has(edge.target) || seen.has(key)) return false
    seen.add(key); return true
  }) }
}

export function layoutKnowledgeGraph(nodes: GraphNode[], edges: GraphEdge[]): Record<string, Point> {
  const points: Record<string, Point> = Object.fromEntries(nodes.map((node, index) => {
    const angle = index * 2.399963
    const radius = 50 + Math.sqrt(index / Math.max(nodes.length, 1)) * 250
    return [node.id, { x: 500 + Math.cos(angle) * radius, y: 350 + Math.sin(angle) * radius }]
  }))
  for (let iteration = 0; iteration < 130; iteration++) {
    const forces = Object.fromEntries(nodes.map(node => [node.id, { x: (500 - points[node.id].x) * 0.008, y: (350 - points[node.id].y) * 0.008 }]))
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].id, b = nodes[j].id
      const dx = points[a].x - points[b].x, dy = points[a].y - points[b].y
      const distance = Math.max(10, Math.hypot(dx, dy))
      const strength = 1600 / (distance * distance)
      forces[a].x += dx / distance * strength; forces[a].y += dy / distance * strength
      forces[b].x -= dx / distance * strength; forces[b].y -= dy / distance * strength
    }
    for (const edge of edges) {
      const a = points[edge.source], b = points[edge.target]
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx, dy))
      const length = nodes.length < 30 ? (edge.kind === 'tag' ? 190 : 165) : (edge.kind === 'tag' ? 140 : 105)
      const strength = (distance - length) * 0.025
      forces[edge.source].x += dx / distance * strength; forces[edge.source].y += dy / distance * strength
      forces[edge.target].x -= dx / distance * strength; forces[edge.target].y -= dy / distance * strength
    }
    for (const node of nodes) {
      points[node.id].x = Math.max(70, Math.min(900, points[node.id].x + Math.max(-8, Math.min(8, forces[node.id].x))))
      points[node.id].y = Math.max(65, Math.min(600, points[node.id].y + Math.max(-8, Math.min(8, forces[node.id].y))))
    }
  }
  return points
}
