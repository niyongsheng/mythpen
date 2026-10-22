import { useCallback, useEffect, useState } from 'react'
import { useProjectStore } from '@/stores/useProjectStore'
import type {
  Character,
  CharacterRelation,
  Foreshadow,
  Memory,
  PayoffPoint,
  ProjectStats,
  ScienceEntry,
  TimelineEvent,
  WorldEntry,
} from '@/types'
import {
  charactersApi,
  foreshadowsApi,
  memoriesApi,
  payoffsApi,
  relationsApi,
  scienceApi,
  statsApi,
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

  const load = useCallback(async () => {
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
      setData(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
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

export function useStats() {
  const project = useProjectName()
  return useApiData<ProjectStats>(project ? () => statsApi.get(project) : null, [project])
}
