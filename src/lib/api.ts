// API client for Mythpen backend
// Dev: /api is proxied by Vite to localhost:3001
// Tauri production: sidecar server runs on 127.0.0.1:3001

import { t } from '@/i18n'
import {
  toChapter,
  toCharacter,
  toClue,
  toForeshadow,
  toMemory,
  toPayoffPoint,
  toRelation,
  toScienceEntry,
  toStats,
} from './dto'
import { isTauri } from './runtime'

const API_BASE = isTauri ? 'http://127.0.0.1:3001/api' : '/api'

// Normalize double slashes (e.g. /api//stats → /api/stats) that happen
// when a project name is empty. Skip the protocol colon so http:// stays.
export const apiUrl = (path: string) => `${API_BASE}${path}`.replace(/([^:]\/)\/+/g, '$1')

function requestConfig(options: any = {}) {
  const config: any = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  }
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body)
  }
  return config
}

async function request(path: string, options: any = {}) {
  const res = await fetch(apiUrl(path), requestConfig(options))
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(err.error?.message || err.message || `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── Projects ───

export interface ImportSseHandlers {
  onStage?: (payload: any) => void
  onProgress?: (payload: any) => void
  onWarning?: (payload: any) => void
  onDone?: (payload: any) => void
  onError?: (error: Error) => void
}

export const projectsApi = {
  list: () => request('/projects'),
  get: (name: string) => request(`/projects/${encodeURIComponent(name)}`),
  create: (data: any) => request('/projects', { method: 'POST', body: data }),
  importWithAI: (data: any, handlers: ImportSseHandlers = {}, signal?: AbortSignal): Promise<any> =>
    new Promise((resolve, reject) => {
      let finished = false
      fetch(apiUrl('/projects/import-ai'), requestConfig({ method: 'POST', body: data, signal }))
        .then(async (response) => {
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}))
            const error = new Error(payload.error?.message || `HTTP ${response.status}`)
            ;(error as any).code = payload.error?.code
            handlers.onError?.(error)
            reject(error)
            return
          }
          await readSSEStream(response, {
            stage: (payload) => handlers.onStage?.(payload),
            progress: (payload) => handlers.onProgress?.(payload),
            warning: (payload) => handlers.onWarning?.(payload),
            done: (payload) => {
              finished = true
              handlers.onDone?.(payload)
              resolve(payload)
            },
            error: (payload) => {
              finished = true
              const error = new Error(payload?.message || t('project.import.importFailed'))
              ;(error as any).code = payload?.code
              handlers.onError?.(error)
              reject(error)
            },
          })
          if (!finished) {
            const error = new Error(t('project.import.connectionInterrupted'))
            ;(error as any).code = 'IMPORT_STREAM_CLOSED'
            handlers.onError?.(error)
            reject(error)
          }
        })
        .catch((error) => {
          // A user-initiated cancel is not an AI failure.
          if (error?.name === 'AbortError') {
            reject(error)
            return
          }
          handlers.onError?.(error)
          reject(error)
        })
    }),
  delete: (name: string) => request(`/projects/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  getPhase: (name: string) => request(`/${encodeURIComponent(name)}/workflow/phase`),
  setPhase: (name: string, phase: string) =>
    request(`/${encodeURIComponent(name)}/workflow/phase`, { method: 'PUT', body: { phase } }),
  uploadCover: (name: string, data: string, mime: string) =>
    request(`/${encodeURIComponent(name)}/cover`, { method: 'POST', body: { data, mime } }),
  deleteCover: (name: string) => request(`/${encodeURIComponent(name)}/cover`, { method: 'DELETE' }),
  getCoverUrl: (name: string) => apiUrl(`/${encodeURIComponent(name)}/cover`),
}

// ─── Chapters ───

export const chaptersApi = {
  list: async (project: string, slim = false) =>
    ((await request(`/${encodeURIComponent(project)}/chapters${slim ? '?slim=1' : ''}`)) as any[]).map(toChapter),
  get: async (project: string, num: number, volumeId?: number, previewChars?: number) => {
    const params = new URLSearchParams()
    if (volumeId) params.set('volume_id', String(volumeId))
    if (previewChars) params.set('preview', String(previewChars))
    const query = params.toString()
    return toChapter(await request(`/${encodeURIComponent(project)}/chapters/${num}${query ? `?${query}` : ''}`))
  },
  update: async (project: string, num: number, data: any) =>
    toChapter(await request(`/${encodeURIComponent(project)}/chapters/${num}`, { method: 'PUT', body: data })),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/chapters`, { method: 'POST', body: data }),
}

// ─── Volumes ───

export const volumesApi = {
  list: (project: string, slim = false) => request(`/${encodeURIComponent(project)}/volumes${slim ? '?slim=1' : ''}`),
}

// ─── Characters ───

export const charactersApi = {
  list: async (project: string) =>
    ((await request(`/${encodeURIComponent(project)}/characters`)) as any[]).map(toCharacter),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/characters`, { method: 'POST', body: data }),
  update: (project: string, id: string, data: any) =>
    request(`/${encodeURIComponent(project)}/characters/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
  remove: (project: string, id: string) =>
    request(`/${encodeURIComponent(project)}/characters/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

// ─── World ───

export const worldApi = {
  list: (project: string) => request(`/${encodeURIComponent(project)}/world`),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/world`, { method: 'POST', body: data }),
  update: (project: string, id: string, data: any) =>
    request(`/${encodeURIComponent(project)}/world/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
  remove: (project: string, id: string) =>
    request(`/${encodeURIComponent(project)}/world/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

// ─── Science ───

export const scienceApi = {
  list: async (project: string) =>
    ((await request(`/${encodeURIComponent(project)}/science`)) as any[]).map(toScienceEntry),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/science`, { method: 'POST', body: data }),
  update: (project: string, id: string, data: any) =>
    request(`/${encodeURIComponent(project)}/science/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
  remove: (project: string, id: string) =>
    request(`/${encodeURIComponent(project)}/science/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

// ─── Clue Board (线索板) ───

export const cluesApi = {
  list: async (project: string, status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : ''
    return ((await request(`/${encodeURIComponent(project)}/clues${qs}`)) as any[]).map(toClue)
  },
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/clues`, { method: 'POST', body: data }),
  update: (project: string, id: string, data: any) =>
    request(`/${encodeURIComponent(project)}/clues/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
  remove: (project: string, id: string) =>
    request(`/${encodeURIComponent(project)}/clues/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

// ─── Foreshadows ───

export const foreshadowsApi = {
  list: async (project: string, status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : ''
    return ((await request(`/${encodeURIComponent(project)}/foreshadows${qs}`)) as any[]).map(toForeshadow)
  },
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/foreshadows`, { method: 'POST', body: data }),
  update: (project: string, id: string, data: any) =>
    request(`/${encodeURIComponent(project)}/foreshadows/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
  remove: (project: string, id: string) =>
    request(`/${encodeURIComponent(project)}/foreshadows/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

// ─── Payoffs (爽点) ───

export const payoffsApi = {
  list: async (project: string, status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : ''
    return ((await request(`/${encodeURIComponent(project)}/payoffs${qs}`)) as any[]).map(toPayoffPoint)
  },
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/payoffs`, { method: 'POST', body: data }),
  update: (project: string, id: string, data: any) =>
    request(`/${encodeURIComponent(project)}/payoffs/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
  remove: (project: string, id: string) =>
    request(`/${encodeURIComponent(project)}/payoffs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

// ─── Relations ───

export const relationsApi = {
  list: async (project: string) =>
    ((await request(`/${encodeURIComponent(project)}/relations`)) as any[]).map(toRelation),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/relations`, { method: 'POST', body: data }),
  update: (project: string, id: string, data: any) =>
    request(`/${encodeURIComponent(project)}/relations/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
  remove: (project: string, id: string) =>
    request(`/${encodeURIComponent(project)}/relations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

// ─── Memories ───

export const memoriesApi = {
  list: async (project: string) => ((await request(`/${encodeURIComponent(project)}/memories`)) as any[]).map(toMemory),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/memories`, { method: 'POST', body: data }),
  update: (project: string, id: string, data: any) =>
    request(`/${encodeURIComponent(project)}/memories/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
  remove: (project: string, id: string) =>
    request(`/${encodeURIComponent(project)}/memories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  search: async (project: string, query: string) =>
    (
      (await request(`/${encodeURIComponent(project)}/memories/search`, { method: 'POST', body: { query } })) as any[]
    ).map(toMemory),
}

// ─── Timeline ───

export const timelineApi = {
  list: (project: string) => request(`/${encodeURIComponent(project)}/timeline`),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/timeline`, { method: 'POST', body: data }),
  update: (project: string, id: string, data: any) =>
    request(`/${encodeURIComponent(project)}/timeline/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
  remove: (project: string, id: string) =>
    request(`/${encodeURIComponent(project)}/timeline/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

// ─── Stats ───

export const statsApi = {
  get: async (project: string) => toStats(await request(`/${encodeURIComponent(project)}/stats`)),
  updateTargetWords: (project: string, targetWords: number) =>
    request(`/${encodeURIComponent(project)}/target-words`, { method: 'PUT', body: { targetWords } }),
  resetTargetWords: (project: string) => request(`/${encodeURIComponent(project)}/target-words`, { method: 'DELETE' }),
}

// ─── Settings ───

export const settingsApi = {
  get: () => request('/settings'),
  update: (key: string, value: string) => request('/settings', { method: 'PUT', body: { key, value } }),
}

// ─── Chat / AI (always uses HTTP) ───

function aiRequest(path: string, options: any = {}) {
  return fetch(apiUrl(path), requestConfig(options))
}

// Shared SSE stream reader — handles buffering, line splitting, event dispatch
async function readSSEStream(response: Response, handlers: Record<string, (payload: any) => void>): Promise<void> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
        continue
      }
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') continue
      try {
        const handler = handlers[currentEvent]
        if (handler) handler(JSON.parse(payload))
      } catch {
        /* ignore parse errors */
      }
    }
  }
}

export const aiApi = {
  chat: (messages: any[], project: string) =>
    aiRequest('/ai/chat', { method: 'POST', body: { messages, project } }).then((r) => r.json()),

  chatStream: (
    messages: any[],
    project: string,
    onChunk: (t: string) => void,
    onEnd: () => void,
    onError: (e: any) => void,
    mode = 'writing',
    onToolCall?: (tc: any) => void,
    onToolResult?: (tr: any) => void,
  ) => {
    const controller = new AbortController()
    aiRequest('/ai/chat/stream', {
      method: 'POST',
      body: { messages, project, mode },
      signal: controller.signal,
    })
      .then(async (response) => {
        let gotError = false
        await readSSEStream(response, {
          content_chunk: (data) => onChunk(data.text || ''),
          tool_call: (data) => onToolCall?.(data),
          tool_result: (data) => onToolResult?.(data),
          error: (data) => {
            gotError = true
            onError(data)
          },
          task_error: (data) => {
            gotError = true
            onError(data)
          },
        })
        if (!gotError) onEnd()
      })
      .catch((e) => {
        // A user-initiated stop aborts the fetch; that is not an AI failure.
        if (e?.name === 'AbortError') return
        onError(e)
      })
    return controller
  },

  continueWriting: (
    chapterNum: number,
    context: string,
    project: string,
    onChunk: (t: string) => void,
    onEnd: (data?: any) => void,
    onError: (e: any) => void,
    mode: 'continue' | 'polish' = 'continue',
  ) => {
    const controller = new AbortController()
    let finished = false
    aiRequest('/ai/continue', {
      method: 'POST',
      body: { chapterNum, context, project, mode },
      signal: controller.signal,
    })
      .then(async (response) => {
        await readSSEStream(response, {
          content_chunk: (data) => onChunk(data.text || ''),
          task_end: (data) => {
            finished = true
            onEnd(data)
          },
          error: (data) => {
            finished = true
            onError(data)
          },
          task_error: (data) => {
            finished = true
            onError(data)
          },
        })
        if (!finished) onEnd()
      })
      .catch((e) => onError(e))
    return controller
  },
}

// ─── Chat sessions ───

export const chatApi = {
  listSessions: (project: string) => request(`/${encodeURIComponent(project)}/chat/sessions`),
  createSession: (project: string, title?: string) =>
    request(`/${encodeURIComponent(project)}/chat/sessions`, { method: 'POST', body: { title } }),
  deleteSession: (project: string, sessionId: string) =>
    request(`/${encodeURIComponent(project)}/chat/sessions/${sessionId}`, { method: 'DELETE' }),
  updateSession: (project: string, sessionId: string, title: string) =>
    request(`/${encodeURIComponent(project)}/chat/sessions/${sessionId}`, { method: 'PUT', body: { title } }),
  list: (project: string, sessionId?: string) => {
    const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''
    return request(`/${encodeURIComponent(project)}/chat/messages${qs}`)
  },
  save: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/chat/messages`, { method: 'POST', body: data }),
}

// ─── AI Response JSON extraction utilities ───
// Common pattern across pages: extract JSON array/object from AI chat response text
export function extractAIJsonArray(text: string | null | undefined): any[] | null {
  if (!text) return null
  const m = text.match(/\[[\s\S]*\]/)
  return m ? tryParseJSON(m[0]) : null
}

export function extractAIJsonObject(text: string | null | undefined): Record<string, any> | null {
  if (!text) return null
  const m = text.match(/\{[\s\S]*\}/)
  return m ? tryParseJSON(m[0]) : null
}

function tryParseJSON(s: string): any | null {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

export function getAIResponseText(res: any): string {
  return res?.choices?.[0]?.message?.content?.trim() || ''
}

export function getCoverUrl(name: string): string {
  return `${API_BASE}/${encodeURIComponent(name)}/cover`
}
