const Sentry = require('./instrument');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./routes/api');
const importRoutes = require('./routes/import');
const aiRoutes = require('./routes/ai');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───
// The sidecar can open and write user files, so only the app itself may call
// it. Requests without an Origin (curl, the Tauri shell) stay allowed.
const ALLOWED_ORIGINS = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
]);
// Vite may fall back to another port when 5173 is busy; local dev origins are
// safe to allow. Remote websites are rejected.
const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.has(origin) || LOCAL_DEV_ORIGIN.test(origin)) {
        return callback(null, true);
      }
      callback(null, false);
    },
  }),
);
// Imports can carry a whole book (~60MB for 20M CJK chars + JSON overhead);
// every other endpoint keeps the original 10mb limit. Express path matching
// uses segment boundaries, so `/import` does not cover `/import-ai` — both
// paths need an explicit parser.
app.use('/api/projects/import', express.json({ limit: '128mb' }));
app.use('/api/projects/import-ai', express.json({ limit: '128mb' }));
app.use(express.json({ limit: '10mb' }));

// ─── Request logging ───
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (req.path.startsWith('/api/ai')) return; // don't log AI streaming
    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// ─── API Routes ───
app.use('/api', importRoutes);
app.use('/api', apiRoutes);
app.use('/api', aiRoutes);

// Must be registered after routes and before the app's own error responder.
Sentry.setupExpressErrorHandler(app);

// ═══════════════════════════════════════════
// AI CONFIG — read from config.db
// ═══════════════════════════════════════════

const { getAiConfig, invalidateAiConfigCache } = require('./ai-config');

// ─── Health check ───
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: 'connected',
    version: '0.1.0',
    mode: 'development',
  });
});

// ─── Graceful shutdown endpoint (must be registered before the 404 handler) ───
app.post('/api/shutdown', (req, res) => {
  res.json({ status: 'shutting_down' });
  setImmediate(() => gracefulShutdown());
});

// ─── Not found & error handling ───
app.use((req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `${req.method} ${req.path} 不存在`, recoverable: false },
  });
});

// Express 5 forwards rejected async handlers here. Always reply with the
// same JSON envelope the client's request() helper expects.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  console.error(`[API] ${req.method} ${req.path} failed:`, err.message);
  res.status(status).json({
    error: {
      code: err.code || (status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED'),
      message: err.message || '服务器内部错误',
      recoverable: err.recoverable ?? status < 500,
    },
  });
});

// ─── Graceful shutdown ───
// Called by Tauri on app exit to avoid antivirus flagging SIGKILL/TerminateProcess
let serverInstance = null;

function gracefulShutdown() {
  console.log('\n  🛑 Shutting down Mythpen API Server gracefully...');
  // Flush pending SQLite writes before the process exits.
  try {
    db.closeAllDatabases();
  } catch (e) {
    console.warn('[Server] Failed to close databases:', e.message);
  }
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('  ✓ Server closed.');
      process.exit(0);
    });
    // Keep-alive / SSE sockets would otherwise keep close() waiting.
    try {
      serverInstance.closeAllConnections?.();
    } catch (e) {
      console.warn('[Server] Failed to close connections:', e.message);
    }
    // Safety net: never keep the desktop app waiting for long.
    setTimeout(() => {
      console.error('  ⚠️  Server close timed out, forcing exit.');
      process.exit(0);
    }, 1000);
  } else {
    process.exit(0);
  }
}

// Handle SIGTERM from Tauri (sent before SIGKILL on some platforms)
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Share cache invalidation with routes (settings updates clear the cache)
db.invalidateAiConfigCache = invalidateAiConfigCache;

// ─── Start (async — init DB then listen) ───
const { initDatabase } = db;
const serverStartTime = Date.now();
console.log('[Server] Mythpen API Server starting...');
console.log('[Server] Port:', PORT);
initDatabase()
  .then(() => {
    // Privacy: restore the anonymous-statistics opt-out before serving errors.
    try {
      const row = db.dbQuery("SELECT value FROM app_settings WHERE key = 'anonymous_stats'")[0];
      Sentry.setAnonymousStats(!row || row.value !== 'false');
    } catch (e) {
      console.warn('[Server] Failed to load anonymous_stats setting:', e.message);
    }
    // Bind loopback only: the API can read/write project files and must never
    // be reachable from the LAN.
    serverInstance = app.listen(PORT, '127.0.0.1', () => {
      const cfg = getAiConfig();
      const elapsed = Date.now() - serverStartTime;
      console.log(`\n  🖋️  Mythpen API Server`);
      console.log(`  ─────────────────────`);
      console.log(`  Local:   http://localhost:${PORT}`);
      console.log(`  Health:  http://localhost:${PORT}/api/health`);
      console.log(`  AI:      ${cfg.apiModel} @ ${cfg.apiBaseUrl}`);
      console.log(`  Startup: ${elapsed}ms`);
      console.log(`\n  Ready.\n`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to initialise database:', err);
    Sentry.captureException(err);
    Sentry.flush(2000).finally(() => process.exit(1));
  });
