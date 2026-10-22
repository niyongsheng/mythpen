import { create } from 'zustand'
import { t } from '@/i18n'
import { track } from '@/lib/analytics'
import { isTauri } from '@/lib/runtime'
import { checkForUpdate, downloadAndInstall, restartApp, type Update } from '@/lib/updater'

export type UpdateStatus = 'idle' | 'checking' | 'upToDate' | 'available' | 'downloading' | 'ready' | 'error'

const LAST_CHECK_KEY = 'mythpen-update-last-check'
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

interface UpdateState {
  status: UpdateStatus
  version: string
  notes: string
  error: string
  errorContext: 'check' | 'install' | null
  progress: number
  dismissed: boolean
  update: Update | null
  /** Manual check from Settings. */
  check: (options?: { silent?: boolean }) => Promise<void>
  /** Startup check, throttled to once per day. */
  autoCheck: () => Promise<void>
  install: () => Promise<void>
  restart: () => Promise<void>
  dismiss: () => void
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  version: '',
  notes: '',
  error: '',
  errorContext: null,
  progress: 0,
  dismissed: false,
  update: null,

  check: async ({ silent = false } = {}) => {
    const current = get()
    if (current.status === 'checking' || current.status === 'downloading' || current.status === 'ready') return

    if (!isTauri) {
      if (!silent) set({ status: 'error', error: t('update.unsupported'), errorContext: 'check' })
      return
    }

    set({ status: 'checking', error: '', errorContext: null })
    try {
      const update = await checkForUpdate()
      // The plugin holds a backend resource per update; release the old one
      // when a check replaces it (unless we are about to install it).
      if (current.update && current.update !== update) {
        current.update.close().catch(() => {})
      }

      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()))

      if (update) {
        track('update_available', { version: update.version })
        set({
          status: 'available',
          update,
          version: update.version,
          notes: update.body || '',
          dismissed: false,
        })
      } else {
        set({ status: 'upToDate', update: null, version: '', notes: '' })
      }
    } catch (err) {
      // Startup checks stay quiet: offline users should not get an error card.
      if (silent) {
        set({ status: 'idle' })
      } else {
        set({ status: 'error', error: errorMessage(err), errorContext: 'check' })
      }
    }
  },

  autoCheck: async () => {
    // Dev builds are not installable bundles; avoid prompting while developing.
    if (!isTauri || import.meta.env.DEV) return
    if (get().status !== 'idle') return
    const last = Number(localStorage.getItem(LAST_CHECK_KEY) || 0)
    if (Date.now() - last < CHECK_INTERVAL_MS) return
    await get().check({ silent: true })
  },

  install: async () => {
    const { update, status } = get()
    if (!update || status === 'downloading' || status === 'ready') return

    set({ status: 'downloading', progress: 0, error: '', errorContext: null })
    try {
      await downloadAndInstall(update, ({ percent }) => set({ progress: percent }))
      track('update_installed', { version: update.version })
      set({ status: 'ready', progress: 100, dismissed: false })
    } catch (err) {
      set({ status: 'error', error: errorMessage(err), errorContext: 'install' })
    }
  },

  restart: async () => {
    try {
      await restartApp()
    } catch (err) {
      set({ status: 'error', error: errorMessage(err), errorContext: 'install' })
    }
  },

  dismiss: () => set({ dismissed: true }),
}))
