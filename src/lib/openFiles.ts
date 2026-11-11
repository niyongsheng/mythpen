// Drains .mythpen paths queued by the Rust shell (cold start argv, macOS
// RunEvent::Opened, or a second launch forwarded by single-instance).

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect } from 'react'
import { openProjectFile, showError } from './projectFiles'
import { isTauri } from './runtime'

export function useOpenProjectFiles(): void {
  useEffect(() => {
    if (!isTauri) return

    let disposed = false
    let running = false
    let wakeAgain = false

    const drain = async () => {
      if (running) {
        wakeAgain = true
        return
      }
      running = true
      try {
        do {
          wakeAgain = false
          let paths: string[] = []
          try {
            paths = await invoke<string[]>('take_pending_open_files')
          } catch {
            break
          }
          for (const path of paths) {
            if (disposed) return
            try {
              await openProjectFile(path, 'double_click')
            } catch (err) {
              showError(err, 'project.file.openFailed')
            }
          }
        } while (wakeAgain && !disposed)
      } finally {
        running = false
      }
    }

    void drain()
    const unlisten = listen('mythpen://open-files', () => {
      void drain()
    })
    return () => {
      disposed = true
      void unlisten.then((fn) => fn())
    }
  }, [])
}
