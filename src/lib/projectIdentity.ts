// Analytics helpers shared by project-scoped events. The project key is an
// opaque UUID stored in project_meta — it lets events from the same book be
// joined across days without ever sending the project name or its content.
import { useProjectStore } from '@/stores/useProjectStore'

export { ageDays, bucketCount, bucketWords } from '@/lib/analyticsBuckets'

export function projectKey(projectName?: string | null): string | undefined {
  if (!projectName) return undefined
  return useProjectStore.getState().projects.find((p) => p.name === projectName)?.analyticsId || undefined
}

/** `{ project_key }` when the project is known, otherwise an empty object. */
export function projectProps(projectName?: string | null): Record<string, string> {
  const key = projectKey(projectName)
  return key ? { project_key: key } : {}
}
