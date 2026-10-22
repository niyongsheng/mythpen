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
app.use(cors());
// Imports can carry a whole book (~60MB for 20M CJK chars + JSON overhead);
// every other endpoint keeps the original 10mb limit.
app.use('/api/projects/import', express.json({ limit: '128mb' }));
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
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('  ✓ Server closed.');
      process.exit(0);
    });
    // Force exit after 5s if close hangs
    setTimeout(() => {
      console.error('  ⚠️  Server close timed out, forcing exit.');
      process.exit(0);
    }, 5000);
  } else {
    process.exit(0);
  }
}

app.post('/api/shutdown', (req, res) => {
  res.json({ status: 'shutting_down' });
  setImmediate(() => gracefulShutdown());
});

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
    serverInstance = app.listen(PORT, () => {
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
    process.exit(1);
  });
