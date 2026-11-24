import * as Sentry from '@sentry/react'
import { isAnonymousStatsEnabled } from './anonymousStats'

// Public DSN for the single `mythpen-app` Sentry project. The React frontend,
// Express sidecar and Rust shell all report here; `component` separates them.
const SENTRY_DSN = 'https://40e635de6482f1da9dabef83edabbec3@o4512410989428736.ingest.us.sentry.io/4512410999455744'

/**
 * Failures the author is expected to see and act on: provider outages, bad
 * credentials/quota, local-network blips and model output-shape retries. They
 * remain visible in the UI and are counted by analytics (`ok: 0`), but are not
 * application bugs and would otherwise bury them in Sentry.
 */
const EXPECTED_ERROR_PATTERNS = [
  /self signed certificate/i,
  /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EPIPE)\b/i,
  /socket hang up|fetch failed|Failed to fetch|error sending request for url|error decoding response body/i,
  /^network error$/i,
  /Unable to connect/i,
  /^API Error: \d{3}\b/,
  // describeAIError() maps provider statuses to these actionable messages.
  /API Key 无效或已过期|API 账户余额不足|API 访问被拒绝|模型或接口不存在|请求过于频繁|AI 服务商暂时不可用/,
  /请先在设置中配置 API Key/,
  /项目".*"不存在/,
  /项目文件由更新版本的 Mythpen 创建/,
  /参数不是合法 JSON|参数被截断/,
  /模型把本次输出预算全部用于思考|模型没有生成正文|模型没有返回任何内容|润色结果为空/,
  /^HTTP 4\d\d$/,
]

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  const payload = error as { error?: unknown } | null
  const inner = payload?.error
  if (typeof inner === 'string') return inner
  if (inner && typeof inner === 'object' && 'message' in inner) {
    return String((inner as { message?: unknown }).message ?? '')
  }
  return String(error ?? '')
}

function isExpectedErrorMessage(message: string): boolean {
  return Boolean(message) && EXPECTED_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

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
      // The public DSN has been reused by other local builds (e.g. flowverse).
      // Only accept events produced by a Mythpen frontend build.
      if (event.release && !event.release.startsWith('mythpen@')) return null
      // Expected, user-actionable failures are not application bugs.
      const values = event.exception?.values
      const primary = String(values?.[values.length - 1]?.value || '')
      if (isExpectedErrorMessage(primary)) return null
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
  if (isExpectedErrorMessage(errorMessageOf(error))) return
  const value = error instanceof Error ? error : new Error(errorMessageOf(error))
  Sentry.captureException(value, { tags })
}
