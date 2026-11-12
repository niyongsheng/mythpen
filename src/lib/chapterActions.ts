import { chaptersApi, volumesApi } from '@/lib/api'
import { CHAPTER_DELETE_ENTITIES, notifyDataChanged } from '@/lib/dataEvents'
import { flushEditorSave } from '@/lib/editorSave'
import { useChapterStore } from '@/stores/useChapterStore'
import { useProjectStore } from '@/stores/useProjectStore'

// Manual structure edits share the same persistence + refresh path as AI tool
// calls: write the project DB, reload the chapter store, then broadcast so any
// page subscribed to `useDataRefresh` picks up the change.

/** Create a chapter and invalidate the aggregate counts it feeds. */
export async function createChapter(project: string, title: string, volumeId: number): Promise<any> {
  const created = await useChapterStore.getState().createChapter(project, title, '', volumeId)
  notifyDataChanged('stats')
  return created
}

export async function renameVolume(project: string, volumeId: number, title: string): Promise<void> {
  const next = title.trim()
  if (!next) return
  await volumesApi.update(project, volumeId, { title: next })
  // The rename cannot change chapter content, so update the local volume
  // title in place instead of reloading every chapter body.
  useChapterStore.setState((state) => ({
    volumes: state.volumes.map((volume) => (volume.id === volumeId ? { ...volume, title: next } : volume)),
  }))
  notifyDataChanged('volume')
  // The dashboard's volume card is fed by the stats endpoint, which includes
  // volume names; refresh it alongside the chapter store.
  notifyDataChanged('stats')
}

export async function deleteChapter(project: string, num: number): Promise<void> {
  await flushEditorSave()
  await chaptersApi.remove(project, num)
  await Promise.all([useChapterStore.getState().loadChapters(project), useProjectStore.getState().loadProjects()])
  for (const entity of CHAPTER_DELETE_ENTITIES) notifyDataChanged(entity)
  notifyDataChanged('stats')
}
