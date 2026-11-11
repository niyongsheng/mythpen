import { create } from 'zustand'
import { statsApi } from '@/lib/api'
import type { ProjectStats } from '@/types'

interface StatsState {
  /** Project the stored data belongs to; null before the first load. */
  project: string | null
  data: ProjectStats | null
  loading: boolean
  error: string | null
  load: (project: string) => Promise<void>
}

// Sidebar, Dashboard and the status bar all render the same `/stats` payload,
// and any data change invalidates all three at once. Keep one request and one
// copy of the result instead of one per subscriber.
let inFlight: { project: string; promise: Promise<void> } | null = null
let requestId = 0

export const useStatsStore = create<StatsState>((set) => ({
  project: null,
  data: null,
  loading: true,
  error: null,

  load: (project) => {
    // Share only the latest request: a project switch invalidates the one that
    // was already in flight, and any later load() replaces `inFlight`.
    if (inFlight?.project === project) return inFlight.promise

    const id = ++requestId
    set({ project, loading: true, error: null })
    const promise = statsApi
      .get(project)
      .then(
        (data) => {
          if (id === requestId) set({ data: data as ProjectStats, loading: false })
        },
        (e) => {
          if (id === requestId) {
            set({ error: e instanceof Error ? e.message : String(e), loading: false })
          }
        },
      )
      .finally(() => {
        if (inFlight?.promise === promise) inFlight = null
      })
    inFlight = { project, promise }
    return promise
  },
}))
