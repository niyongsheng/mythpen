import { useCallback, useEffect, useState } from 'react'
import { useProjectStore } from '@/stores/useProjectStore'
import {
  chaptersApi,
  charactersApi,
  foreshadowsApi,
  memoriesApi,
  relationsApi,
  scienceApi,
  settingsApi,
  statsApi,
  timelineApi,
  volumesApi,
  worldApi,
} from './api'

// ─── Generic fetch hook ───
function useApiData(fetcher, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      setData(result)
    } catch (e) {
      setError(e.message)
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
export function useProjectName() {
  return useProjectStore((s) => s.currentProject || '我的科幻小说')
}

export function useChapters() {
  const project = useProjectName()
  const [chapters, setChapters] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!project) return
    setLoading(true)
    chaptersApi
      .list(project)
      .then(setChapters)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [project])

  return { chapters, loading }
}

export function useVolumes() {
  const project = useProjectName()
  return useApiData(() => volumesApi.list(project), [project])
}

export function useCharacters() {
  const project = useProjectName()
  return useApiData(() => charactersApi.list(project), [project])
}

export function useWorldEntries() {
  const project = useProjectName()
  return useApiData(() => worldApi.list(project), [project])
}

export function useScienceEntries() {
  const project = useProjectName()
  return useApiData(() => scienceApi.list(project), [project])
}

export function useForeshadows(status) {
  const project = useProjectName()
  return useApiData(() => foreshadowsApi.list(project, status), [project, status])
}

export function useRelations() {
  const project = useProjectName()
  return useApiData(() => relationsApi.list(project), [project])
}

export function useMemories() {
  const project = useProjectName()
  return useApiData(() => memoriesApi.list(project), [project])
}

export function useTimelineEvents() {
  const project = useProjectName()
  return useApiData(() => timelineApi.list(project), [project])
}

export function useStats() {
  const project = useProjectName()
  return useApiData(() => statsApi.get(project), [project])
}

export function useSettings() {
  return useApiData(() => settingsApi.get(), [])
}

// ─── Chapter content ───
export function useChapterContent(num) {
  const project = useProjectName()
  return useApiData(() => chaptersApi.get(project, num), [project, num])
}
