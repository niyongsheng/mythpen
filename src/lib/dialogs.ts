import { documentDir } from '@tauri-apps/api/path'
import { open, save } from '@tauri-apps/plugin-dialog'
import { isTauri } from './runtime'

export const PROJECT_FILE_EXT = '.mythpen'

const PROJECT_FILE_FILTER = { name: 'Mythpen Project', extensions: ['mythpen'] }

/** Sanitize a project title into a safe default document filename. */
export function defaultDocumentFileName(name: string): string {
  const cleaned = (name || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/^\.+/, '')
    .replace(/\.mythpen$/i, '')
    .trim()
    .slice(0, 80)
  return `${cleaned || '未命名项目'}${PROJECT_FILE_EXT}`
}

function ensureExtension(filePath: string): string {
  return filePath.toLowerCase().endsWith(PROJECT_FILE_EXT) ? filePath : `${filePath}${PROJECT_FILE_EXT}`
}

/** Native open dialog. Returns null outside Tauri (browser dev). */
export async function pickProjectFile(): Promise<string | null> {
  if (!isTauri) return null
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [PROJECT_FILE_FILTER],
  })
  return typeof selected === 'string' ? selected : null
}

/**
 * Native save dialog for a new/save-as document. The default lives directly in
 * Documents so the target directory always exists; the user may choose another
 * folder. Returns null when cancelled or outside Tauri.
 */
export async function pickSaveLocation(projectName: string): Promise<string | null> {
  if (!isTauri) return null
  let defaultPath: string | undefined
  try {
    const documents = await documentDir()
    defaultPath = `${documents.replace(/[\\/]$/, '')}/${defaultDocumentFileName(projectName)}`
  } catch {
    defaultPath = defaultDocumentFileName(projectName)
  }
  const selected = await save({
    defaultPath,
    filters: [PROJECT_FILE_FILTER],
  })
  return selected ? ensureExtension(selected) : null
}
