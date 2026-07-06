// API client for Mythpen backend
// Dev: /api is proxied by Vite to localhost:3001
// Tauri production: sidecar server runs on 127.0.0.1:3001

// In Tauri v2, __TAURI_INTERNALS__ is injected by the runtime automatically.
// No npm package needed for this detection.
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const API_BASE = isTauri ? 'http://127.0.0.1:3001/api' : '/api'

async function request(path: string, options: any = {}) {
  const url = `${API_BASE}${path}`
  const config: any = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  }
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body)
  }
  const res = await fetch(url, config)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(err.error?.message || err.message || `HTTP ${res.status}`)
  }
  return res.json()
}

// ─── Projects ───

export const projectsApi = {
  list: () => request('/projects'),
  get: (name: string) => request(`/projects/${encodeURIComponent(name)}`),
  create: (data: any) => request('/projects', { method: 'POST', body: data }),
  delete: (name: string) => request(`/projects/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  getPhase: (name: string) => request(`/${encodeURIComponent(name)}/workflow/phase`),
  setPhase: (name: string, phase: string) =>
    request(`/${encodeURIComponent(name)}/workflow/phase`, { method: 'PUT', body: { phase } }),
  getSidebarItems: async (name: string) => {
    const items: any[] = await request(`/${encodeURIComponent(name)}/sidebar-items`)
    return items.map((item: any) => ({
      id: item.id,
      labelKey: item.label_key,
      icon: item.icon,
      category: item.category,
      genres: item.genres,
      sortOrder: item.sort_order,
      route: item.route,
      enabled: !!item.enabled,
    }))
  },
  uploadCover: (name: string, data: string, mime: string) =>
    request(`/${encodeURIComponent(name)}/cover`, { method: 'POST', body: { data, mime } }),
  deleteCover: (name: string) => request(`/${encodeURIComponent(name)}/cover`, { method: 'DELETE' }),
  getCoverUrl: (name: string) => `/api/${encodeURIComponent(name)}/cover`,
}

// ─── Chapters ───

export const chaptersApi = {
  list: (project: string) => request(`/${encodeURIComponent(project)}/chapters`),
  get: (project: string, num: number) => request(`/${encodeURIComponent(project)}/chapters/${num}`),
  update: (project: string, num: number, data: any) =>
    request(`/${encodeURIComponent(project)}/chapters/${num}`, { method: 'PUT', body: data }),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/chapters`, { method: 'POST', body: data }),
}

// ─── Volumes ───

export const volumesApi = {
  list: (project: string) => request(`/${encodeURIComponent(project)}/volumes`),
}

// ─── Characters ───

export const charactersApi = {
  list: (project: string) => request(`/${encodeURIComponent(project)}/characters`),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/characters`, { method: 'POST', body: data }),
}

// ─── World ───

export const worldApi = {
  list: (project: string) => request(`/${encodeURIComponent(project)}/world`),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/world`, { method: 'POST', body: data }),
}

// ─── Science ───

export const scienceApi = {
  list: (project: string) => request(`/${encodeURIComponent(project)}/science`),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/science`, { method: 'POST', body: data }),
}

// ─── Foreshadows ───

export const foreshadowsApi = {
  list: (project: string, status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : ''
    return request(`/${encodeURIComponent(project)}/foreshadows${qs}`)
  },
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/foreshadows`, { method: 'POST', body: data }),
}

// ─── Relations ───

export const relationsApi = {
  list: (project: string) => request(`/${encodeURIComponent(project)}/relations`),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/relations`, { method: 'POST', body: data }),
}

// ─── Memories ───

export const memoriesApi = {
  list: (project: string) => request(`/${encodeURIComponent(project)}/memories`),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/memories`, { method: 'POST', body: data }),
  search: (project: string, query: string) =>
    request(`/${encodeURIComponent(project)}/memories/search`, { method: 'POST', body: { query } }),
}

// ─── Timeline ───

export const timelineApi = {
  list: (project: string) => request(`/${encodeURIComponent(project)}/timeline`),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/timeline`, { method: 'POST', body: data }),
}

// ─── Stats ───

export const statsApi = {
  get: (project: string) => request(`/${encodeURIComponent(project)}/stats`),
}

// ─── Settings ───

export const settingsApi = {
  get: () => request('/settings'),
  update: (key: string, value: string) => request('/settings', { method: 'PUT', body: { key, value } }),
}

// ─── Chat / AI (always uses HTTP) ───

function aiRequest(path: string, options: any = {}) {
  const url = `${API_BASE}${path}`
  const config: any = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  }
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body)
  }
  return fetch(url, config)
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
    fetch(`${API_BASE}/ai/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, project, mode }),
      signal: controller.signal,
    })
      .then(async (response) => {
        await readSSEStream(response, {
          content_chunk: (data) => onChunk(data.text || ''),
          tool_call: (data) => onToolCall?.(data),
          tool_result: (data) => onToolResult?.(data),
        })
        onEnd()
      })
      .catch((e) => onError(e))
    return controller
  },

  continueWriting: (
    chapterNum: number,
    context: string,
    project: string,
    onChunk: (t: string) => void,
    onEnd: (data?: any) => void,
    onError: (e: any) => void,
  ) => {
    const controller = new AbortController()
    let finished = false
    fetch(`${API_BASE}/ai/continue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterNum, context, project }),
      signal: controller.signal,
    })
      .then(async (response) => {
        await readSSEStream(response, {
          content_chunk: (data) => onChunk(data.text || ''),
          done: (data) => {
            finished = true
            onEnd(data)
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
