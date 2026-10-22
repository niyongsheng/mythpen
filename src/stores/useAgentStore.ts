import { create } from 'zustand'
import { chatApi } from '@/lib/api'
import { useProjectStore } from '@/stores/useProjectStore'
import type { ChatMessage } from '@/types'

/** True while `project` is still the active project — async results that
 *  arrive after a project switch must not overwrite the new project's view. */
const isCurrentProject = (project: string) => useProjectStore.getState().currentProject === project

/**
 * A single in-flight AI answer. Runs are keyed by project + session and live
 * independently of the active view, so an answer keeps streaming (and saving
 * to its own session) after the user switches to another project.
 */
export interface ChatRun {
  project: string
  sessionId: string
  taskName: string
  streamText: string
  genTokens: number
  toolCalls: any[]
  status: 'running' | 'completed' | 'error'
}

interface AgentState {
  messages: ChatMessage[]
  sessions: any[]
  currentSessionId: string | null
  loading: boolean
  /** project name → session id → run */
  runs: Record<string, Record<string, ChatRun>>
  addMessage: (msg: ChatMessage) => void
  loadMessages: (project: string) => Promise<void>
  loadSessions: (project: string) => Promise<void>
  createSession: (project: string, title?: string) => Promise<string>
  switchSession: (project: string, sessionId: string) => Promise<void>
  deleteSession: (project: string, sessionId: string) => Promise<void>
  updateSessionTitle: (project: string, sessionId: string, title: string) => Promise<void>
  startRun: (project: string, sessionId: string, taskName: string) => void
  updateRun: (project: string, sessionId: string, patch: Partial<ChatRun>) => void
  finishRun: (project: string, sessionId: string) => void
}

export const useAgentStore = create<AgentState>((set, get) => ({
  messages: [],
  sessions: [],
  currentSessionId: null,
  loading: false,
  runs: {},

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  loadMessages: async (project) => {
    if (!project) return
    const sid = get().currentSessionId
    if (!sid) return // nothing to load
    set({ loading: true })
    try {
      const msgs = await chatApi.list(project, sid)
      // Guard: project or session changed while loading — discard stale result
      if (!isCurrentProject(project) || get().currentSessionId !== sid) return
      set({ messages: msgs, loading: false })
    } catch {
      if (isCurrentProject(project) && get().currentSessionId === sid) {
        set({ messages: [], loading: false })
      }
    }
  },

  loadSessions: async (project) => {
    if (!project) return
    try {
      const sessions = await chatApi.listSessions(project)
      if (!isCurrentProject(project)) return
      set({ sessions })
      // Auto-select the session with a run still in flight (switching back
      // mid-answer should resume showing it), else the most recent one.
      if (!get().currentSessionId && sessions.length > 0) {
        const projectRuns = get().runs[project] || {}
        const running = sessions.find((sess: any) => projectRuns[sess.id]?.status === 'running')
        set({ currentSessionId: (running || sessions[0]).id })
      }
    } catch {
      if (isCurrentProject(project)) set({ sessions: [] })
    }
  },

  createSession: async (project, title?: string) => {
    const session = await chatApi.createSession(project, title)
    if (!isCurrentProject(project)) return session.id
    set((s) => ({
      sessions: [session, ...s.sessions],
      currentSessionId: session.id,
      messages: [],
      loading: false,
    }))
    return session.id
  },

  switchSession: async (project, sessionId) => {
    set({ currentSessionId: sessionId, messages: [], loading: true })
    try {
      const msgs = await chatApi.list(project, sessionId)
      if (!isCurrentProject(project) || get().currentSessionId !== sessionId) return
      set({ messages: msgs, loading: false })
    } catch {
      if (get().currentSessionId === sessionId) set({ messages: [], loading: false })
    }
  },

  deleteSession: async (project, sessionId) => {
    await chatApi.deleteSession(project, sessionId)
    if (!isCurrentProject(project)) return
    const remaining = get().sessions.filter((s: any) => s.id !== sessionId)
    const newCurrent = get().currentSessionId === sessionId ? remaining[0]?.id || null : get().currentSessionId
    set({
      sessions: remaining,
      currentSessionId: newCurrent,
      messages: newCurrent ? [] : [],
    })
    if (newCurrent) {
      const msgs = await chatApi.list(project, newCurrent)
      if (!isCurrentProject(project) || get().currentSessionId !== newCurrent) return
      set({ messages: msgs })
    }
  },

  updateSessionTitle: async (project, sessionId, title) => {
    await chatApi.updateSession(project, sessionId, title)
    if (!isCurrentProject(project)) return
    set((s) => ({
      sessions: s.sessions.map((sess: any) => (sess.id === sessionId ? { ...sess, title } : sess)),
    }))
  },

  startRun: (project, sessionId, taskName) =>
    set((s) => ({
      runs: {
        ...s.runs,
        [project]: {
          ...(s.runs[project] || {}),
          [sessionId]: {
            project,
            sessionId,
            taskName,
            streamText: '',
            genTokens: 0,
            toolCalls: [],
            status: 'running',
          },
        },
      },
    })),

  updateRun: (project, sessionId, patch) =>
    set((s) => {
      const run = s.runs[project]?.[sessionId]
      if (!run) return s
      return {
        runs: {
          ...s.runs,
          [project]: { ...s.runs[project], [sessionId]: { ...run, ...patch } },
        },
      }
    }),

  finishRun: (project, sessionId) =>
    set((s) => {
      const projectRuns = s.runs[project]
      if (!projectRuns?.[sessionId]) return s
      const nextProjectRuns = { ...projectRuns }
      delete nextProjectRuns[sessionId]
      const runs = { ...s.runs }
      if (Object.keys(nextProjectRuns).length === 0) delete runs[project]
      else runs[project] = nextProjectRuns
      return { runs }
    }),
}))
