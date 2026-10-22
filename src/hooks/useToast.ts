import { useCallback, useEffect, useRef, useState } from 'react'

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

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)
  // Auto-dismiss timers are keyed by toast id; exit timers use -id.
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const schedule = useCallback((key: number, fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(key)
      fn()
    }, ms)
    timers.current.set(key, timer)
  }, [])

  const dismiss = useCallback(
    (id: number) => {
      const pending = timers.current.get(id)
      if (pending) {
        clearTimeout(pending)
        timers.current.delete(id)
      }
      setToasts((prev) => {
        const toast = prev.find((t) => t.id === id)
        if (!toast || toast.leaving) return prev
        return prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
      })
      if (!timers.current.has(-id)) {
        schedule(-id, () => setToasts((prev) => prev.filter((t) => t.id !== id)), EXIT_MS)
      }
    },
    [schedule],
  )

  const show = useCallback(
    (message: string, type: Toast['type'] = 'info', duration = DEFAULT_DURATION[type]) => {
      const id = ++nextId.current
      setToasts((prev) => {
        const next = [...prev, { id, message, type, duration }]
        // Drop the oldest instead of flooding the viewport.
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next
      })
      schedule(id, () => dismiss(id), duration)
    },
    [dismiss, schedule],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  return { toasts, show, dismiss }
}
