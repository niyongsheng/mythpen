// Privacy-first product analytics via Aptabase.
// No cookies, no project names or other user content — only event names,
// coarse custom properties, OS and app version (added by the native plugin).
import { trackEvent } from '@aptabase/tauri'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { isTauri } from './runtime'

type Props = Record<string, string | number>

// ── Analytics level (build-time) ───────────────────────────────────────────
// Aptabase's free plan covers 20k events/month across ALL installs combined,
// so how much we record is a build-time decision:
//
//   VITE_ANALYTICS_LEVEL=minimal|basic|standard|full pnpm tauri build
//
//   minimal   native app_started/app_exited only (one pair per launch)
//   basic     activation and core-usage signals (default)
//   standard  product usage detail without the high-frequency noise
//   full      everything, including every screen view and focus change
//
// The native lifecycle events live in Rust and are always sent; this
// variable only needs to reach the frontend build environment (CI `env:` or
// an exported shell variable).

export type AnalyticsLevel = 'minimal' | 'basic' | 'standard' | 'full'

const LEVEL_RANK: Record<AnalyticsLevel, number> = {
  minimal: 0,
  basic: 1,
  standard: 2,
  full: 3,
}

// Minimum level required for each event. Unknown events require `standard`,
// so a newly added event never leaks into basic/minimal builds by accident.
const EVENT_LEVEL: Record<string, AnalyticsLevel> = {
  // Native lifecycle (tracked in Rust; listed here for documentation)
  app_started: 'minimal',
  app_exited: 'minimal',
  // Activation and retention
  project_opened: 'basic',
  project_created: 'basic',
  project_imported: 'basic',
  ai_run_finished: 'basic',
  milestone_reached: 'basic',
  update_install_started: 'basic',
  update_installed: 'basic',
  update_install_failed: 'basic',
  // Product usage
  import_started: 'standard',
  import_canceled: 'standard',
  import_failed: 'standard',
  project_phase_changed: 'standard',
  chapter_created: 'standard',
  chapter_status_changed: 'standard',
  chapter_saved: 'standard',
  entity_created: 'standard',
  ai_message_sent: 'standard',
  ai_continue: 'standard',
  ai_polish: 'standard',
  ai_generation_finished: 'standard',
  project_exported: 'standard',
  export_failed: 'standard',
  update_available: 'standard',
  // screen_view: once per screen per app run at standard; every hit at full
  screen_view: 'standard',
  // High-frequency noise, full builds only
  app_visibility_changed: 'full',
  update_dismissed: 'full',
}

// Per-install daily budgets. A single heavy session must not be able to burn
// the shared monthly quota. `null` means uncapped (full builds are internal).
const DAILY_CAP: Record<AnalyticsLevel, number | null> = {
  minimal: 30, // unreachable: minimal sends no frontend events
  basic: 30,
  standard: 150,
  full: null,
}

function parseLevel(value: string | undefined): AnalyticsLevel {
  const level = (value ?? '').trim().toLowerCase()
  // Includes 'basic' and invalid values.
  return level === 'minimal' || level === 'standard' || level === 'full' ? level : 'basic'
}

export const ANALYTICS_LEVEL: AnalyticsLevel = parseLevel(import.meta.env.VITE_ANALYTICS_LEVEL)

const DAILY_COUNT_KEY = 'mythpen-analytics-daily-count'
const seenScreens = new Set<string>()

/** Reserve one slot in today's per-install event budget. */
function withinDailyCap(): boolean {
  const cap = DAILY_CAP[ANALYTICS_LEVEL]
  if (cap === null) return true
  try {
    const today = new Date().toDateString()
    let count = 0
    const raw = localStorage.getItem(DAILY_COUNT_KEY)
    if (raw) {
      const stored = JSON.parse(raw) as { date?: string; count?: number }
      if (stored.date === today && typeof stored.count === 'number') count = stored.count
    }
    if (count >= cap) return false
    localStorage.setItem(DAILY_COUNT_KEY, JSON.stringify({ date: today, count: count + 1 }))
    return true
  } catch {
    // Storage unavailable — keep tracking rather than silently disabling it.
    return true
  }
}

// The Aptabase plugin only exists inside the Tauri shell. When the frontend
// runs in a plain browser (e.g. `pnpm dev`), tracking is a no-op.
export function track(event: string, props?: Props): void {
  if (!isTauri) return
  // Settings → Privacy: the user can opt out of anonymous statistics entirely.
  if (!useSettingsStore.getState().settings.anonymousStats) return
  const rank = LEVEL_RANK[ANALYTICS_LEVEL]
  const minLevel = EVENT_LEVEL[event] ?? 'standard'
  if (rank < LEVEL_RANK[minLevel]) return

  // At standard, screen_view is deduped per screen for the whole app run so
  // navigation does not dominate the event budget; full keeps every hit.
  if (event === 'screen_view' && ANALYTICS_LEVEL === 'standard') {
    const screen = String(props?.screen ?? '')
    if (seenScreens.has(screen)) return
    seenScreens.add(screen)
  }

  if (!withinDailyCap()) return
  trackEvent(event, props).catch(() => {
    // Analytics must never break the app
  })
}
