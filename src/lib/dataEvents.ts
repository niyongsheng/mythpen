// Lightweight event bus for cross-store data invalidation.
// AI tool calls modify the DB through the backend; the frontend stores
// need to know when to re-fetch. This lets any store broadcast "entity X
// changed" and any component/store subscribe.

import { useChapterStore } from '@/stores/useChapterStore'
import { useProjectStore } from '@/stores/useProjectStore'

/** Entity types that can be modified by AI tool calls. */
export type EntityType =
  | 'chapter'
  | 'volume'
  | 'character'
  | 'world'
  | 'science'
  | 'foreshadow'
  | 'relation'
  | 'memory'
  | 'timeline'
  | 'stats'
  | 'project'
  | 'chat'
  | 'all'

export type DataChangeEvent = { entity: EntityType }

type Listener = (event: DataChangeEvent) => void

let listeners: Listener[] = []

/** Subscribe to data change events. Returns an unsubscribe function. */
export function onDataChanged(fn: Listener): () => void {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}

/** Broadcast that data has changed. Any store that cares about `entity` should re-fetch. */
export function notifyDataChanged(entity: EntityType): void {
  const event: DataChangeEvent = { entity }
  // Use setTimeout to avoid cascading updates inside a React render cycle
  setTimeout(() => {
    for (const fn of listeners) {
      try {
        fn(event)
      } catch {
        /* guard against listener crashes */
      }
    }
  }, 0)
}

// ═══════════════════════════════════════════════
// Manual Refresh
// ═══════════════════════════════════════════════

/**
 * Trigger a full manual refresh of all data.
 * Calls every known store's reload method and broadcasts 'all'.
 */
export function refreshAllData(project?: string): Promise<void> {
  const proj = project || useProjectStore.getState().currentProject

  // Fire all reloads in parallel
  const reloads: Promise<any>[] = []

  // loadChapters() already reloads the selected chapter's body.
  if (proj) reloads.push(useChapterStore.getState().loadChapters(proj))

  reloads.push(useProjectStore.getState().loadProjects())

  return Promise.all(reloads).then(() => {
    // Broadcast 'all' for any component using useDataRefresh hook
    const event: DataChangeEvent = { entity: 'all' }
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        for (const fn of listeners) {
          try {
            fn(event)
          } catch {
            /* noop */
          }
        }
        resolve()
      }, 0)
    })
  })
}
