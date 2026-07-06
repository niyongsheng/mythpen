// ─── Project ───
export interface ProjectInfo {
  id: string
  name: string
  iconName: string
  genres: string[]
  mode: 'short-story' | 'medium-novel' | 'long-novel'
  language: string
  wordCount: number
  chapterCount: number
  lastOpened: string
  status: string
}

export interface ProjectMeta {
  name: string
  description: string
  mode: string
  language: string
  version: string
  createdAt: string
  updatedAt: string
  wordCount: number
  authorName: string
  autoConfirm: boolean
  embeddingEnabled: boolean
}

// ─── Chapters ───
export interface Chapter {
  id: number
  volumeId: number
  num: number
  title: string
  outline: string
  content: string
  summary: string
  wordCount: number
  status: 'pending' | 'writing' | 'review' | 'accepted'
  cognitiveFrame: string
  emotionalAnchor: string
  worldTexture: string
  concreteMystery: string
  interpersonalTension: string
  createdAt: string
  updatedAt: string
}

export interface Volume {
  id: number
  sortOrder: number
  title: string
  summary: string
  chapters: Chapter[]
}

// ─── Characters ───
export interface Character {
  id: string
  name: string
  age: string
  gender: string
  appearance: string
  personality: string
  background: string
  motivation: string
  arc: string
  extMarkers: string
  avatar: string
  notes: string
  chapterCount?: number
  role?: 'major' | 'minor' | 'extra'
}

// ─── World ───
export interface WorldEntry {
  id: string
  category: string
  name: string
  description: string
  tags: string
}

// ─── Science ───
export interface ScienceEntry {
  id: string
  label: 'known' | 'extrapolation' | 'hypothesis'
  name: string
  description: string
  references: string
}

// ─── Foreshadow ───
export interface Foreshadow {
  id: string
  title: string
  description: string
  status: 'planted' | 'progressing' | 'resolved' | 'abandoned'
  plantedChapterId?: number
  expectedResolveChapter: number
  resolvedChapterId?: number
  priority: 'low' | 'normal' | 'high'
}

// ─── Memory ───
export interface Memory {
  id: string
  category: 'character' | 'location' | 'item' | 'event' | 'promise' | 'other'
  content: string
  sourceChapterId?: number
  similarity?: number
}

// ─── Character Relation ───
export interface CharacterRelation {
  id: string
  characterAId: string
  characterBId: string
  relationType: string
  description: string
  intensity: number
  startedAt: string
  endedAt: string
  layoutX?: number
  layoutY?: number
}

// ─── Graph Nodes ───
export interface GraphNode {
  id: string
  name: string
  radius: number
  color: string
  x: number
  y: number
  fixed?: boolean
}

export interface GraphLink {
  source: string
  target: string
  type: string
  intensity: number
  color: string
  dashed: boolean
  label: string
}

// ─── Timeline ───
export interface TimelineEvent {
  id: string
  year: string
  title: string
  description: string
  importance: number
}

// ─── Workflow ───
export type WorkflowPhase = 'idea' | 'setting' | 'outline' | 'writing' | 'review' | 'consistency' | 'export'

// ─── Agent ───
export interface AgentTask {
  taskName: string
  chapterNum?: number
  status: 'idle' | 'running' | 'completed' | 'error' | 'cancelled'
  progress?: number
  inputTokens?: number
  outputTokens?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'ai' | 'system'
  content: string
  toolCalls?: { id: string; name: string; arguments: any; status?: string; result?: any }[]
}

// ─── Settings ───
export interface AppSettings {
  apiKey: string
  apiKeyDeepseek: string
  apiKeyAnthropic: string
  apiKeyOpenai: string
  apiBaseUrl: string
  apiModel: string
  apiType: 'openai' | 'claude'
  uiLanguage: 'zh' | 'en'
  theme: 'dark' | 'light'
  editorFontSize: number
  editorFontFamily: string
  autoSaveInterval: number
  backupEnabled: boolean
  accentColor: string
  maxOutputTokens: number
  httpTimeout: number
}

// ─── Statistics ───
export interface ProjectStats {
  totalWords: number
  chapterCount: number
  acceptedCount: number
  characterCount: number
  foreshadowCount: number
  resolvedForeshadow: number
  overdueForeshadow: number
  worldCount: number
  sciCount: number
  tokenInput: number
  tokenOutput: number
  currentChapter?: { id: number; num: number; title: string; word_count: number; status: string; content: string }
  chapters: { id: number; num: number; title: string; word_count: number; status: string }[]
  dailyWords: number[]
  targetWords: number
}

// ─── Export ───
export interface ExportRecord {
  id: string
  format: 'txt' | 'markdown' | 'epub' | 'pdf'
  filePath: string
  wordCount: number
  exportedAt: string
}

// ─── Consistency ───
export interface ConsistencyIssue {
  type: 'conflict' | 'timeline' | 'foreshadow' | 'science'
  severity: 'error' | 'warn'
  title: string
  description: string
  location: string
}

// ─── Sidebar ───
export interface SidebarItem {
  id: string
  labelKey: string
  icon: string
  category: 'universal' | 'genre' | 'optional'
  genres: string
  sortOrder: number
  route: string
  enabled: boolean
}
