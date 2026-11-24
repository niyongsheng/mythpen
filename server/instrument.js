// Sentry must be initialised before Express and the other server modules so
// its auto-instrumentation can hook into the Node runtime.
//
// All three Mythpen runtimes report to one Sentry project; the `component`
// tag keeps frontend/server/desktop errors filterable. The DSN is public
// (Sentry client keys are not secrets). Reporting is enabled only for packaged
// builds: Tauri launches the sidecar with MYTHPEN_ENV=production.
const Sentry = require('@sentry/node');

const production = process.env.MYTHPEN_ENV === 'production' || process.env.NODE_ENV === 'production';
const version = process.env.MYTHPEN_VERSION;

// Errors users are expected to see and can act on themselves. They are still
// returned to the UI and counted by product analytics (`ai_run_finished` with
// `ok: 0`), but reporting every provider outage, quota exhaustion or transient
// socket reset buries real application bugs in Sentry.
const EXPECTED_ERROR_PATTERNS = [
  // Network / TLS failures between the sidecar, the provider or the updater.
  /self signed certificate/i,
  /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EPIPE)\b/i,
  /socket hang up|fetch failed|fetch\(\) URL is invalid/i,
  /The operation timed out/i,
  // Provider returned an HTTP error (bad key, quota, outage, blocked region).
  /^API Error: \d{3}\b/,
  // User configuration / expected domain states.
  /请先在设置中配置 API Key/,
  /项目".*"不存在/,
  /项目文件由更新版本的 Mythpen 创建/,
  // Model output shape issues; the tool loop retries, then shows an actionable
  // message to the author.
  /参数不是合法 JSON|参数被截断/,
];

function primaryExceptionValue(event) {
  const values = event.exception?.values;
  if (!values || values.length === 0) return '';
  // Sentry orders chained exceptions outermost last.
  return String(values[values.length - 1]?.value || '');
}

function isExpectedError(value) {
  return Boolean(value) && EXPECTED_ERROR_PATTERNS.some((pattern) => pattern.test(value));
}

// Mirrors the frontend's Settings → Privacy toggle. `beforeSend` drops all
// events while this is false, so opting out takes effect without a restart.
let anonymousStatsEnabled = true;
Sentry.setAnonymousStats = (enabled) => {
  anonymousStatsEnabled = Boolean(enabled);
};

Sentry.init({
  dsn: 'https://40e635de6482f1da9dabef83edabbec3@o4512410989428736.ingest.us.sentry.io/4512410999455744',
  enabled: production,
  environment: production ? 'production' : 'development',
  release: version ? `mythpen-server@${version}` : 'mythpen-server@dev',
  initialScope: { tags: { component: 'server' } },
  tracesSampleRate: 0,
  beforeBreadcrumb(breadcrumb) {
    // Console logs can echo provider payloads or manuscript excerpts.
    if (breadcrumb.category === 'console') return null;
    return breadcrumb;
  },
  beforeSend(event) {
    // Honour the user's anonymous-statistics opt-out.
    if (!anonymousStatsEnabled) return null;
    // Expected, user-actionable failures are not application bugs.
    if (isExpectedError(primaryExceptionValue(event))) return null;
    // Never send manuscript content, request bodies or secrets.
    delete event.user;
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      delete event.request.headers;
    }
    if (event.extra) {
      for (const key of ['detail', 'args', 'content', 'body', 'prompt', 'messages', 'text']) {
        delete event.extra[key];
      }
    }
    if (event.exception?.values) {
      for (const exception of event.exception.values) {
        // Some tool-call errors attach the raw truncated arguments as a
        // property; cap the displayed value defensively.
        if (typeof exception.value === 'string' && exception.value.length > 500) {
          exception.value = `${exception.value.slice(0, 500)}…`;
        }
      }
    }
    return event;
  },
});

module.exports = Sentry;
