// Anonymous usage statistics & crash reports (Aptabase + Sentry).
//
// The preference lives in localStorage next to the other settings, but it is
// read directly here so the early Sentry initialisation in main.tsx does not
// need to import the settings store (which pulls in the i18n module).

import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './runtime'

const SETTINGS_KEY = 'mythpen-settings'

/** Enabled unless the user has explicitly turned anonymous statistics off. */
export function isAnonymousStatsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return true
    return JSON.parse(raw)?.anonymousStats !== false
  } catch {
    return true
  }
}

/**
 * Mirror the preference into the Rust shell so native lifecycle events and
 * desktop crash reports honour it too. No-op outside the Tauri shell.
 */
export function syncAnonymousStatsToShell(enabled: boolean): void {
  if (!isTauri) return
  invoke('set_anonymous_stats', { enabled }).catch(() => {
    // Privacy sync must never break the app.
  })
}
