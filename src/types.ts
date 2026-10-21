export type RuntimeStatus = 'idle' | 'running' | 'stopping' | 'exited' | 'error'
export type ItemType = 'app' | 'source' | 'dataset' | 'document'
export type Visibility = 'active' | 'archived' | 'hidden'

export interface LogEntry {
  id: number
  stream: 'stdout' | 'stderr' | 'system'
  text: string
  timestamp: string
}

export interface ProjectRuntime {
  status: RuntimeStatus
  pid: number | null
  exitCode: number | null
  logs: LogEntry[]
}

export interface Project {
  id: string
  name: string
  path: string
  stack: string[]
  description: string
  modifiedAt: string
  suggestedCommand: string
  favorite: boolean
  groupId: string | null
  tags: string[]
  notes: string
  command: string
  runtime: ProjectRuntime
  itemType: ItemType
  visibility: Visibility
  expanded: boolean
  parentPath: string | null
}

export interface ProjectGroup {
  id: string
  name: string
}

export interface HubState {
  root: string
  groups: ProjectGroup[]
  projects: Project[]
  knowledge: KnowledgeEntry[]
  knowledgeError: string | null
}

export type KnowledgeKind = 'note' | 'link' | 'file'

export interface KnowledgeBranch {
  id: string
  parentId: string | null
  quote: string
  title: string
  kind: 'question' | 'idea' | 'explanation'
  content: string
}

export interface KnowledgeDraft {
  id?: string
  title: string
  kind: KnowledgeKind
  category: string
  tags: string[]
  content: string
  target: string
  projectPath: string | null
  pinned: boolean
  branches?: KnowledgeBranch[]
}

export interface KnowledgeEntry extends KnowledgeDraft {
  id: string
  createdAt: string
  updatedAt: string
}

export interface ProjectPatch {
  favorite?: boolean
  groupId?: string | null
  tags?: string[]
  notes?: string
  command?: string
  itemType?: ItemType
  visibility?: Visibility
  expanded?: boolean
}

export interface SizeResult {
  bytes: number
  truncated: boolean
}

export interface ViewFilter {
  kind: 'all' | 'favorite' | 'running' | 'group' | 'archived' | 'hidden' | 'knowledge' | 'settings'
  groupId?: string
}

export interface RuntimeChangedPayload {
  projectPath: string
  runtime: ProjectRuntime
}

export interface ProjectHubApi {
  getModelSettings: () => Promise<{ baseUrl: string; model: string; hasKey: boolean; error: string | null }>
  saveModelSettings: (input: { baseUrl: string; model: string; apiKey: string; clearKey: boolean }) => Promise<{ baseUrl: string; model: string; hasKey: boolean; error: string | null }>
  completeBranch: (input: { title: string; quote: string; question: string; content: string; kind?: KnowledgeBranch['kind'] }) => Promise<string>
  getState: () => Promise<HubState>
  refresh: () => Promise<HubState>
  saveKnowledge: (input: KnowledgeDraft) => Promise<{ state: HubState; id: string }>
  deleteKnowledge: (id: string) => Promise<HubState>
  chooseKnowledgeFile: () => Promise<string | null>
  openKnowledge: (id: string) => Promise<void>
  updateProject: (projectPath: string, patch: ProjectPatch) => Promise<HubState>
  createGroup: (name: string) => Promise<HubState>
  renameGroup: (id: string, name: string) => Promise<HubState>
  deleteGroup: (id: string) => Promise<HubState>
  startProject: (projectPath: string, command: string) => Promise<HubState>
  stopProject: (projectPath: string) => Promise<HubState>
  clearLogs: (projectPath: string) => Promise<HubState>
  calculateSize: (projectPath: string) => Promise<SizeResult>
  openFolder: (projectPath: string) => Promise<void>
  onRuntimeChanged: (callback: (payload: RuntimeChangedPayload) => void) => () => void
}

declare global {
  interface Window {
    projectHub: ProjectHubApi
  }
}
