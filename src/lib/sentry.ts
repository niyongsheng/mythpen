import * as Sentry from '@sentry/react'
import { isAnonymousStatsEnabled } from './anonymousStats'

// Public DSN for the single `mythpen-app` Sentry project. The React frontend,
// Express sidecar and Rust shell all report here; `component` separates them.
const SENTRY_DSN = 'https://40e635de6482f1da9dabef83edabbec3@o4512410989428736.ingest.us.sentry.io/4512410999455744'

let initialized = false

function initClient(): void {
  if (initialized) return
  Sentry.init({
    dsn: SENTRY_DSN,
    release: `mythpen@${__APP_VERSION__}`,
    environment: 'production',
    initialScope: { tags: { component: 'frontend' } },
    tracesSampleRate: 0,
    beforeBreadcrumb(breadcrumb) {
      // Console messages can contain novel text; keep navigation/UI breadcrumbs.
      if (breadcrumb.category === 'console') return null
      return breadcrumb
    },
    beforeSend(event) {
      // Never send request bodies, cookies, headers or user identity. The app
      // handles user manuscripts locally; reports must not include them.
      delete event.user
      if (event.request) {
        delete event.request.data
        delete event.request.cookies
        delete event.request.headers
      }
      if (event.extra) {
        for (const key of ['detail', 'args', 'content', 'body', 'prompt', 'messages', 'text']) {
          delete event.extra[key]
        }
      }
      return event
    },
  })
  initialized = true
}

/**
 * Initialise error monitoring before React mounts.
 *
 * Only production builds report: local `pnpm dev` sessions would otherwise
 * flood the project with development-only errors. The DSN is public by design.
 * Users who turned anonymous statistics off get no reporting at all.
 */
export function initSentry(): void {
  if (!import.meta.env.PROD || !isAnonymousStatsEnabled()) return
  initClient()
}

/** Apply a runtime change from the privacy setting (Settings → Privacy). */
export function setErrorReportingEnabled(enabled: boolean): void {
  if (!import.meta.env.PROD) return
  if (enabled) {
    initClient()
  } else if (initialized) {
    initialized = false
    void Sentry.close()
  }
}

/**
 * Capture an error that was caught by application code (not by the boundary).
 * Accepts Error instances or API payloads shaped `{ error: string }`.
 */
export function captureError(error: unknown, tags?: Record<string, string | number | boolean>): void {
  if (!import.meta.env.PROD || !initialized) return
  const payload = error as { error?: unknown } | null
  const value = error instanceof Error ? error : new Error(String(payload?.error ?? error))
  Sentry.captureException(value, { tags })
}
