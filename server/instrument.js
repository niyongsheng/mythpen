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
