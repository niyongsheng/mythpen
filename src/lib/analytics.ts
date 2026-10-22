// Privacy-first product analytics via Aptabase.
// No cookies, no project names or other user content — only event names,
// coarse custom properties, OS and app version (added by the native plugin).
import { trackEvent } from '@aptabase/tauri'
import { isTauri } from './runtime'

type Props = Record<string, string | number>

// The Aptabase plugin only exists inside the Tauri shell. When the frontend
// runs in a plain browser (e.g. `pnpm dev`), tracking is a no-op.

export function track(event: string, props?: Props): void {
  if (!isTauri) return
  trackEvent(event, props).catch(() => {
    // Analytics must never break the app
  })
}
