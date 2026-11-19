import { listen } from '@tauri-apps/api/event'
import { useToast } from '@/hooks/useToast'
import { t } from '@/i18n'
import { isTauri } from '@/lib/runtime'

/**
 * The bundled Express sidecar can die while the app keeps running (crash,
 * antivirus, or another process taking its port). Surface it instead of
 * letting every action fail with a bare "Failed to fetch".
 */
export function registerSidecarMonitor(): void {
  if (!isTauri) return
  void listen<number | null>('mythpen://sidecar-exited', () => {
    useToast.getState().show(t('serverStatus.sidecarExited'), 'error', 8000)
  })
}
