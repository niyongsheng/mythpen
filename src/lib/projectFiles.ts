// User-owned .mythpen document actions used by the project list, titlebar and
// the OS open-file queue. The file is the project: no copy-in/import step.

import { invoke } from '@tauri-apps/api/core'
import { useToast } from '@/hooks/useToast'
import { t } from '@/i18n'
import { useProjectStore } from '@/stores/useProjectStore'
import { track } from './analytics'
import { projectsApi } from './api'
import { pickProjectFile, pickSaveLocation } from './dialogs'
import { flushEditorSave } from './editorSave'
import { isTauri } from './runtime'

export type ProjectFileOpenSource = 'dialog' | 'double_click' | 'recent'

export function showError(err: unknown, fallbackKey: string) {
  if ((err as any)?.code === 'FEATURE_DISABLED') {
    useToast.getState().show(t('settings.documentModeDisabledHint'), 'info', 6000)
    return
  }
  const message = err instanceof Error ? err.message : String(err || '')
  useToast.getState().show(message || t(fallbackKey), 'error', 6000)
}

/** Display name of a project file (basename across POSIX and Windows paths). */
export function projectFileName(filePath?: string): string | undefined {
  return filePath ? filePath.split(/[\\/]/).pop() : undefined
}

/** Flush pending edits, then force the whole project file to disk. No toast. */
export async function persistProjectFile(): Promise<void> {
  const name = useProjectStore.getState().currentProject
  if (!name) return
  await flushEditorSave()
  await projectsApi.save(name)
}

/** Open (or focus) a .mythpen document, flushing pending editor content first. */
export async function openProjectFile(path: string, source: ProjectFileOpenSource = 'dialog'): Promise<void> {
  const store = useProjectStore.getState()
  if (store.currentProject) await flushEditorSave()

  const opened = await projectsApi.openFile(path)
  if (useProjectStore.getState().currentProject === opened.name) {
    useProjectStore.getState().setCurrentProject(opened.name)
    return
  }
  await useProjectStore.getState().activateProject(opened.name, opened.workflowPhase || 'idea')
  track('project_file_opened', { source })
}

export async function openProjectFileFromDialog(): Promise<void> {
  try {
    const path = await pickProjectFile()
    if (!path) return
    await openProjectFile(path, 'dialog')
  } catch (err) {
    showError(err, 'project.file.openFailed')
  }
}

/** Explicit save (⌘S / menu): flush the editor, then the whole project file. */
export async function saveProjectNow(): Promise<boolean> {
  if (!useProjectStore.getState().currentProject) return false
  try {
    await persistProjectFile()
    useToast.getState().show(t('project.file.saved'), 'success')
    return true
  } catch (err) {
    showError(err, 'project.file.saveFailed')
    return false
  }
}

/** Copy the project to a new .mythpen file and switch to the copy. */
export async function saveProjectAs(): Promise<boolean> {
  const store = useProjectStore.getState()
  const name = store.currentProject
  if (!name) return false
  try {
    const destination = await pickSaveLocation(name)
    if (!destination) return false
    await flushEditorSave()
    // The native save dialog already confirmed replacing an existing file.
    const result = await projectsApi.saveAs(name, destination, true)
    await useProjectStore.getState().activateProject(result.name, store.workflowPhase)
    track('project_file_saved_as', {})
    useToast.getState().show(t('project.file.saveAsDone'), 'success')
    return true
  } catch (err) {
    showError(err, 'project.file.saveAsFailed')
    return false
  }
}

export async function revealCurrentProjectFile(): Promise<void> {
  if (!isTauri) return
  const store = useProjectStore.getState()
  const project = store.projects.find((item) => item.name === store.currentProject)
  const path = project?.filePath
  if (!path) return
  try {
    await invoke('reveal_in_folder', { path })
  } catch (err) {
    showError(err, 'project.file.revealFailed')
  }
}
