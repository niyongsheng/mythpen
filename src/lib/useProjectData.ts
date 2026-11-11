import { useCallback, useEffect, useRef, useState } from 'react'
import { useProjectStore } from '@/stores/useProjectStore'
import { useStatsStore } from '@/stores/useStatsStore'
import type {
  Character,
  CharacterRelation,
  Clue,
  Foreshadow,
  Memory,
  PayoffPoint,
  ScienceEntry,
  TimelineEvent,
  WorldEntry,
} from '@/types'
import {
  charactersApi,
  cluesApi,
  foreshadowsApi,
  memoriesApi,
  payoffsApi,
  relationsApi,
  scienceApi,
  timelineApi,
  worldApi,
} from './api'

// ─── Generic fetch hook ───
function useApiData<T>(
  fetcher: (() => Promise<T>) | null,
  deps: unknown[] = [],
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Ignore responses from older requests; a notification-triggered reload can
  // overlap an in-flight fetch (or a project switch) and the late, stale
  // response must not overwrite the newer one.
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    if (!fetcher) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      if (id !== requestId.current) return
      setData(result)
    } catch (e) {
      if (id !== requestId.current) return
      setError((e as Error).message)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, deps)

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, reload: load }
}

// ─── Project-specific hooks ───
export function useProjectName(): string {
  return useProjectStore((s) => s.currentProject || '')
}

export function useCharacters() {
  const project = useProjectName()
  return useApiData<Character[]>(project ? () => charactersApi.list(project) : null, [project])
}

export function useWorldEntries() {
  const project = useProjectName()
  return useApiData<WorldEntry[]>(project ? () => worldApi.list(project) : null, [project])
}

export function useScienceEntries() {
  const project = useProjectName()
  return useApiData<ScienceEntry[]>(project ? () => scienceApi.list(project) : null, [project])
}

export function useForeshadows(status?: string) {
  const project = useProjectName()
  return useApiData<Foreshadow[]>(project ? () => foreshadowsApi.list(project, status) : null, [project, status])
}

export function usePayoffs(status?: string) {
  const project = useProjectName()
  return useApiData<PayoffPoint[]>(project ? () => payoffsApi.list(project, status) : null, [project, status])
}

export function useClues(status?: string) {
  const project = useProjectName()
  return useApiData<Clue[]>(project ? () => cluesApi.list(project, status) : null, [project, status])
}

export function useRelations() {
  const project = useProjectName()
  return useApiData<CharacterRelation[]>(project ? () => relationsApi.list(project) : null, [project])
}

export function useMemories() {
  const project = useProjectName()
  return useApiData<Memory[]>(project ? () => memoriesApi.list(project) : null, [project])
}

export function useTimelineEvents() {
  const project = useProjectName()
  return useApiData<TimelineEvent[]>(project ? () => timelineApi.list(project) : null, [project])
}

/**
 * Shared stats subscription. One fetch and one copy for every consumer; see
 * `useStatsStore`. Callers get the same shape as the other data hooks.
 */
export function useStats() {
  const project = useProjectName()
  const loadedProject = useStatsStore((s) => s.project)
  const data = useStatsStore((s) => s.data)
  const loading = useStatsStore((s) => s.loading)
  const error = useStatsStore((s) => s.error)
  const load = useStatsStore((s) => s.load)

  useEffect(() => {
    if (project) void load(project)
  }, [project, load])

  const reload = useCallback(() => {
    if (project) void load(project)
  }, [project, load])

  const current = loadedProject === project
  return {
    data: current ? data : null,
    loading: project ? loading : false,
    error: current ? error : null,
    reload,
  }
}
