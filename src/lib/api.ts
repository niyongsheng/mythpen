// API client for Mythpen backend
// Supports both Tauri (Rust commands) and browser dev mode (fetch proxy)

let tauriInvoke: Function | null = null
const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__

// Lazy-load tauri invoke
async function invoke(cmd: string, args: Record<string, unknown> = {}) {
  if (!tauriInvoke) {
    try {
      const mod = await import('@tauri-apps/api/core')
      tauriInvoke = mod.invoke
    } catch {
      tauriInvoke = async () => {
        throw new Error('Tauri not available')
      }
    }
  }
  return (tauriInvoke as Function)(cmd, args)
}

const API_BASE = '/api'

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
  list: () => (isTauri ? invoke('list_projects') : request('/projects')),
  get: (name: string) => (isTauri ? invoke('get_project', { name }) : request(`/projects/${encodeURIComponent(name)}`)),
  create: (data: any) =>
    isTauri
      ? invoke('create_project', {
          name: data.name,
          mode: data.mode || 'medium-novel',
          language: data.language || 'zh',
          genres: data.genres || ['other'],
        })
      : request('/projects', { method: 'POST', body: data }),
  delete: (name: string) =>
    isTauri
      ? invoke('delete_project', { name })
      : request(`/projects/${encodeURIComponent(name)}`, { method: 'DELETE' }),
}

// ─── Chapters ───

export const chaptersApi = {
  list: (project: string) =>
    isTauri ? invoke('list_chapters', { project }) : request(`/${encodeURIComponent(project)}/chapters`),
  get: (project: string, num: number) =>
    isTauri ? invoke('get_chapter', { project, num }) : request(`/${encodeURIComponent(project)}/chapters/${num}`),
  update: (project: string, num: number, data: any) => {
    if (isTauri) {
      return invoke('update_chapter', { project, num, ...data })
    }
    return request(`/${encodeURIComponent(project)}/chapters/${num}`, { method: 'PUT', body: data })
  },
  create: (project: string, data: any) => {
    if (isTauri) {
      return invoke('create_chapter', {
        project,
        title: data.title || '新章节',
        outline: data.outline || '',
        volume_id: data.volume_id || 1,
      })
    }
    return request(`/${encodeURIComponent(project)}/chapters`, { method: 'POST', body: data })
  },
}

// ─── Volumes ───

export const volumesApi = {
  list: (project: string) =>
    isTauri ? invoke('list_volumes', { project }) : request(`/${encodeURIComponent(project)}/volumes`),
}

// ─── Characters ───

export const charactersApi = {
  list: (project: string) =>
    isTauri ? invoke('list_characters', { project }) : request(`/${encodeURIComponent(project)}/characters`),
  create: (project: string, data: any) => {
    if (isTauri) {
      return invoke('create_character', {
        project,
        name: data.name || '',
        age: data.age || '',
        gender: data.gender || '',
        appearance: data.appearance || '',
        personality: data.personality || '',
        background: data.background || '',
      })
    }
    return request(`/${encodeURIComponent(project)}/characters`, { method: 'POST', body: data })
  },
}

// ─── World ───

export const worldApi = {
  list: (project: string) =>
    isTauri ? invoke('list_world', { project }) : request(`/${encodeURIComponent(project)}/world`),
  create: (project: string, data: any) => {
    if (isTauri) {
      return invoke('create_world_entry', {
        project,
        category: data.category || 'location',
        name: data.name || '',
        description: data.description || '',
      })
    }
    return request(`/${encodeURIComponent(project)}/world`, { method: 'POST', body: data })
  },
}

// ─── Science ───

export const scienceApi = {
  list: (project: string) =>
    isTauri ? invoke('list_science', { project }) : request(`/${encodeURIComponent(project)}/science`),
}

// ─── Foreshadows ───

export const foreshadowsApi = {
  list: (project: string) =>
    isTauri ? invoke('list_foreshadows', { project }) : request(`/${encodeURIComponent(project)}/foreshadows`),
}

// ─── Relations ───

export const relationsApi = {
  list: (project: string) =>
    isTauri ? invoke('list_relations', { project }) : request(`/${encodeURIComponent(project)}/relations`),
}

// ─── Memories ───

export const memoriesApi = {
  list: (project: string) =>
    isTauri ? invoke('list_memories', { project }) : request(`/${encodeURIComponent(project)}/memories`),
}

// ─── Timeline ───

export const timelineApi = {
  list: (project: string) =>
    isTauri ? invoke('list_timeline', { project }) : request(`/${encodeURIComponent(project)}/timeline`),
}

// ─── Stats ───

export const statsApi = {
  get: (project: string) =>
    isTauri ? invoke('get_stats', { project }) : request(`/${encodeURIComponent(project)}/stats`),
}

// ─── Settings ───

export const settingsApi = {
  get: () => (isTauri ? invoke('get_settings') : request('/settings')),
  update: (key: string, value: string) =>
    isTauri ? invoke('update_setting', { key, value }) : request('/settings', { method: 'PUT', body: { key, value } }),
}

// ─── Chat / AI (still uses HTTP - Tauri mode uses direct URL) ───

const AI_BASE = isTauri ? 'http://localhost:3001/api' : '/api'

function aiRequest(path: string, options: any = {}) {
  const url = `${AI_BASE}${path}`
  const config: any = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  }
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body)
  }
  return fetch(url, config)
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
  ) => {
    const controller = new AbortController()
    fetch(`${AI_BASE}/ai/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, project, mode }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = decoder.decode(value, { stream: true })
          const lines = text.split('\n').filter((l) => l.startsWith('data: '))
          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.event === 'content_chunk') onChunk(data.text || '')
              if (data.event === 'tool_call') {
                /* handled elsewhere */
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
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
    fetch(`${AI_BASE}/ai/continue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterNum, context, project }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.event === 'content_chunk') onChunk(data.text || '')
                if (data.event === 'done') onEnd(data)
              } catch {
                /* ignore */
              }
            }
          }
        }
        onEnd({ content: buffer })
      })
      .catch((e) => onError(e))
    return controller
  },
}

// ─── Chat sessions ───

export const chatApi = {
  list: (project: string) => request(`/${encodeURIComponent(project)}/chat/sessions`),
  create: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/chat/sessions`, { method: 'POST', body: data }),
  save: (project: string, data: any) =>
    request(`/${encodeURIComponent(project)}/chat/messages`, { method: 'POST', body: data }),
}
