import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { persistProjectFile } from '@/lib/projectFiles'
import { isTauri } from '@/lib/runtime'

const FLUSH_TIMEOUT_MS = 3000

async function flushWithTimeout(): Promise<void> {
  const work = persistProjectFile().catch(() => {
    /* never trap the exit on a save failure */
  })
  await Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS))])
}

/**
 * Persist the editor before closing. Covers both the window close button and
 * app quit (Cmd+Q / Tauri ExitRequested). The Rust `finish_exit` command
 * releases the exit gate and shuts the app down after the flush resolves.
 */
export function registerExitFlush(): void {
  if (!isTauri) return

  const appWindow = getCurrentWindow()
  let closing = false

  // Window close button / Cmd+W.
  void appWindow.onCloseRequested(async (event) => {
    if (closing) return
    event.preventDefault()
    closing = true
    try {
      await flushWithTimeout()
    } finally {
      try {
        await invoke('finish_exit')
      } catch {
        await appWindow.destroy().catch(() => {})
      }
    }
  })

  // App quit (Cmd+Q) / Tauri RunEvent::ExitRequested.
  void listen('mythpen://flush-before-exit', async () => {
    try {
      await flushWithTimeout()
    } finally {
      await invoke('finish_exit').catch(() => {})
    }
  })
}
