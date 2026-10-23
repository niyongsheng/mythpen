// In-app auto-update helpers built on tauri-plugin-updater.
// The update manifest URL and signing public key live in tauri.conf.json.
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { isTauri } from './runtime'

export type { Update }

export interface DownloadProgress {
  downloaded: number
  total: number
  percent: number
}

/** Ask the configured endpoint whether a newer version exists. */
export async function checkForUpdate(): Promise<Update | null> {
  if (!isTauri) throw new Error('auto-update is only available in the desktop app')
  return check({ timeout: 20_000 })
}

/** Download and install an update, reporting coarse progress. */
export async function downloadAndInstall(
  update: Update,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  let downloaded = 0
  let total = 0
  const report = () => {
    onProgress?.({
      downloaded,
      total,
      percent: total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0,
    })
  }

  // Windows: the updater exits the app as soon as the installer is launched,
  // so the installer must relaunch it (restartAfterInstall defaults to true).
  // macOS/Linux: the option is ignored; downloadAndInstall resolves and the
  // UI shows the "restart to apply" state.
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? 0
      report()
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength
      report()
    } else {
      if (total > 0) downloaded = total
      report()
    }
  })
}

/** Relaunch the app so the installed update takes effect. */
export async function restartApp(): Promise<void> {
  if (!isTauri) return
  await relaunch()
}
