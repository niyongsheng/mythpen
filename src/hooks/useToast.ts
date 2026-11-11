import { create } from 'zustand'

export interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
  /** Auto-dismiss delay in ms — also drives the progress bar. */
  duration: number
  /** True while the exit animation plays, just before removal. */
  leaving?: boolean
}

const MAX_TOASTS = 4
const EXIT_MS = 180

const DEFAULT_DURATION: Record<Toast['type'], number> = {
  success: 3200,
  info: 4000,
  error: 6000,
}

interface ToastState {
  toasts: Toast[]
  show: (message: string, type?: Toast['type'], duration?: number) => void
  dismiss: (id: number) => void
}

let nextId = 0
// Timers live at module scope: toasts are app-wide, not owned by one component.
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function schedule(key: number, fn: () => void, ms: number) {
  const timer = setTimeout(() => {
    timers.delete(key)
    fn()
  }, ms)
  timers.set(key, timer)
}

export const useToast = create<ToastState>((set) => ({
  toasts: [],

  dismiss: (id) => {
    const pending = timers.get(id)
    if (pending) {
      clearTimeout(pending)
      timers.delete(id)
    }
    const { toasts } = useToast.getState()
    const toast = toasts.find((t) => t.id === id)
    if (!toast || toast.leaving) return
    set({ toasts: toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) })
    if (!timers.has(-id)) {
      schedule(-id, () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), EXIT_MS)
    }
  },

  show: (message, type = 'info', duration = DEFAULT_DURATION[type]) => {
    const id = ++nextId
    set((s) => {
      const next = [...s.toasts, { id, message, type, duration }]
      // Drop the oldest instead of flooding the viewport.
      return { toasts: next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next }
    })
    schedule(id, () => useToast.getState().dismiss(id), duration)
  },
}))
