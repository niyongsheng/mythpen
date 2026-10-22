const express = require('express');
const db = require('../db');
const { createAIAdapter } = require('../ai-adapter');
const { getAiConfig } = require('../ai-config');
const {
  runImportPipeline,
  MAX_TEXT_CHARS,
  ALLOWED_GENRES,
  ALLOWED_MODES,
  ALLOWED_LANGUAGES,
} = require('../import/pipeline');
const { createProjectFromImport } = require('../import/persist');

const router = express.Router();

// Only one import at a time. Analysis can run for many minutes and keeping a
// second pipeline out avoids duplicate work and SQLite write contention.
let activeImport = null;

function fail(res, status, code, message) {
  return res.status(status).json({
    error: { code, message, recoverable: true },
  });
}

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeGenres(value) {
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.filter((genre) => ALLOWED_GENRES.has(genre)))];
}

router.post('/projects/import-ai', async (req, res) => {
  const body = req.body || {};
  const name = cleanString(body.name, 200);
  const nameError = db.validateProjectName(name);
  if (nameError) {
    return fail(res, 400, 'INVALID_PARAMS', nameError);
  }

  if (db.dbGet('SELECT 1 AS x FROM recent_projects WHERE name = ?', [name])) {
    return fail(res, 409, 'PROJECT_ALREADY_EXISTS', `项目"${name}"已存在`);
  }

  const aiConfig = getAiConfig();
  if (!aiConfig.apiKey) {
    return fail(res, 400, 'AI_NOT_CONFIGURED', '请先在设置中配置 API Key');
  }

  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return fail(res, 400, 'EMPTY_IMPORT', '没有可导入的正文');
  }
  if (text.length > MAX_TEXT_CHARS) {
    return fail(res, 400, 'FILE_TOO_LARGE', '正文内容过大，请拆分后分项目导入');
  }

  if (activeImport) {
    return fail(res, 409, 'IMPORT_BUSY', `已有导入任务（${activeImport}）正在进行，请稍后再试`);
  }

  const rawSource = body.source && typeof body.source === 'object' ? body.source : {};
  const source = {
    fileName: cleanString(rawSource.fileName, 200),
    format: rawSource.format === 'epub' ? 'epub' : 'txt',
    title: cleanString(rawSource.title, 200),
    author: cleanString(rawSource.author, 100),
    description: cleanString(rawSource.description, 2000),
    language: cleanString(rawSource.language, 20),
  };
  const options = {
    name,
    mode: ALLOWED_MODES.has(body.mode) ? body.mode : 'medium-novel',
    language: ALLOWED_LANGUAGES.has(body.language) ? body.language : 'zh',
    genres: normalizeGenres(body.genres),
  };

  // From here on the response is an SSE stream; errors are events, not JSON.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(':ok\n\n');
  // Acquire the lock only after the stream is established. The check above and
  // this assignment are synchronous, so two requests cannot both win.
  activeImport = name;

  let clientClosed = false;
  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      clientClosed = true;
      abortController.abort();
    }
  });
  res.on('error', () => {
    clientClosed = true;
    abortController.abort();
  });

  const send = (event, payload) => {
    if (clientClosed || res.writableEnded) return false;
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    return true;
  };

  // Long AI calls can leave the socket quiet for minutes; keep proxies and
  // the Tauri webview from treating the stream as idle.
  const heartbeat = setInterval(() => {
    if (!clientClosed && !res.writableEnded) res.write(':keepalive\n\n');
  }, 15000);

  try {
    const adapter = createAIAdapter(aiConfig.apiModel, aiConfig, aiConfig.apiType);
    const result = await runImportPipeline({
      text,
      fileName: source.fileName || '未命名作品',
      format: source.format,
      source,
      options,
      adapter,
      aiConfig,
      emit: send,
      isCancelled: () => clientClosed,
      signal: abortController.signal,
    });

    if (clientClosed) return;

    send('stage', { stage: 'persist', message: '正在写入项目' });
    const stats = createProjectFromImport({
      ...result,
      name,
      options,
      source,
      model: aiConfig.apiModel,
    });
    send('done', { ...stats, usage: result.usage?.total || null });
  } catch (err) {
    if (clientClosed || err?.code === 'CANCELLED' || err?.name === 'AbortError') {
      return;
    }
    console.error('[AI Import] Failed:', err);
    const code = typeof err?.code === 'string' ? err.code : 'IMPORT_FAILED';
    const message = err?.message || '导入失败';
    send('error', { code, message });
  } finally {
    clearInterval(heartbeat);
    activeImport = null;
    if (!res.writableEnded) res.end();
  }
});

module.exports = router;
