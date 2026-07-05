import { create } from 'zustand'
import { chatApi } from '@/lib/api'
import type { AgentTask, ChatMessage } from '@/types'

interface AgentState {
  task: AgentTask
  messages: ChatMessage[]
  sessions: any[]
  currentSessionId: string | null
  isRunning: boolean
  loading: boolean
  setTask: (task: Partial<AgentTask>) => void
  addMessage: (msg: ChatMessage) => void
  loadMessages: (project: string) => Promise<void>
  loadSessions: (project: string) => Promise<void>
  createSession: (project: string, title?: string) => Promise<string>
  switchSession: (project: string, sessionId: string) => Promise<void>
  deleteSession: (project: string, sessionId: string) => Promise<void>
  updateSessionTitle: (project: string, sessionId: string, title: string) => Promise<void>
  cancelTask: () => void
}

export const useAgentStore = create<AgentState>((set, get) => ({
  task: { taskName: '', status: 'idle' },
  messages: [],
  sessions: [],
  currentSessionId: null,
  isRunning: false,
  loading: false,

  setTask: (task) => set((s) => ({ task: { ...s.task, ...task } })),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  loadMessages: async (project) => {
    if (!project) return
    const sid = get().currentSessionId
    set({ loading: true })
    try {
      const msgs = await chatApi.list(project, sid || undefined)
      set({ messages: msgs, loading: false })
    } catch {
      set({ messages: [], loading: false })
    }
  },

  loadSessions: async (project) => {
    if (!project) return
    try {
      const sessions = await chatApi.listSessions(project)
      set({ sessions })
      // Auto-select first session if none selected
      if (!get().currentSessionId && sessions.length > 0) {
        set({ currentSessionId: sessions[0].id })
      }
    } catch {
      set({ sessions: [] })
    }
  },

  createSession: async (project, title?: string) => {
    const session = await chatApi.createSession(project, title)
    set((s) => ({
      sessions: [session, ...s.sessions],
      currentSessionId: session.id,
      messages: [],
    }))
    return session.id
  },

  switchSession: async (project, sessionId) => {
    set({ currentSessionId: sessionId, messages: [], loading: true })
    try {
      const msgs = await chatApi.list(project, sessionId)
      set({ messages: msgs, loading: false })
    } catch {
      set({ messages: [], loading: false })
    }
  },

  deleteSession: async (project, sessionId) => {
    await chatApi.deleteSession(project, sessionId)
    const remaining = get().sessions.filter((s: any) => s.id !== sessionId)
    const newCurrent = get().currentSessionId === sessionId ? remaining[0]?.id || null : get().currentSessionId
    set({
      sessions: remaining,
      currentSessionId: newCurrent,
      messages: newCurrent ? [] : [],
    })
    if (newCurrent) {
      const msgs = await chatApi.list(project, newCurrent)
      set({ messages: msgs })
    }
  },

  updateSessionTitle: async (project, sessionId, title) => {
    await chatApi.updateSession(project, sessionId, title)
    set((s) => ({
      sessions: s.sessions.map((sess: any) => (sess.id === sessionId ? { ...sess, title } : sess)),
    }))
  },

  cancelTask: () => set({ isRunning: false, task: { taskName: '', status: 'idle' } }),
}))
