// Privacy-first product analytics via Aptabase.
// No cookies, no project names or other user content — only event names,
// coarse custom properties, OS and app version (added by the native plugin).
import { trackEvent } from '@aptabase/tauri'
import { isTauri } from './runtime'

type Props = Record<string, string | number>

// Event schema (props stay coarse; never send names, content or keys):
//   project_opened · project_created · project_imported · import_started/failed/canceled
//   chapter_created · chapter_status_changed · chapter_saved · entity_created
//   ai_message_sent · ai_run_finished · ai_continue/ai_polish · ai_generation_finished
//   project_exported · export_failed · project_phase_changed · milestone_reached
//   update_available/install_started/installed/install_failed/dismissed
//   screen_view · app_visibility_changed
// Project-scoped events carry an opaque `project_key` (never the project name).

// The Aptabase plugin only exists inside the Tauri shell. When the frontend
// runs in a plain browser (e.g. `pnpm dev`), tracking is a no-op.

export function track(event: string, props?: Props): void {
  if (!isTauri) return
  trackEvent(event, props).catch(() => {
    // Analytics must never break the app
  })
}
