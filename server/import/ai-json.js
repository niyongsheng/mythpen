// ─── AI JSON call helpers ───
// Every import stage asks the model for a strict JSON object. This module
// wraps the provider adapter with timeouts, corrective retries, truncation
// detection, and recursive batch splitting so one bad response cannot destroy
// an otherwise valid import.

const JSON_FENCE_RE = /^\s*```(?:json)?\s*/i;
const JSON_FENCE_END_RE = /\s*```\s*$/i;
const CONTEXT_ERROR_RE = /context length|maximum context|token limit|too many tokens|reduce the length|prompt is too long|input is too long|context_window/i;

function codedError(message, code, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

function cancelledError() {
  return codedError('导入已取消', 'CANCELLED');
}

function extractJsonObject(text) {
  if (!text) return null;
  let cleaned = String(text).trim();
  cleaned = cleaned.replace(JSON_FENCE_RE, '').replace(JSON_FENCE_END_RE, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(codedError(message, 'AI_TIMEOUT')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCancelledError(err, isCancelled) {
  return err?.code === 'CANCELLED'
    || (err?.name === 'AbortError' && (!isCancelled || isCancelled()));
}

function isRetryableError(err) {
  if (!err) return false;
  if (err.code === 'AI_TIMEOUT') return true;
  if (err.status === 429) return true;
  if (typeof err.status === 'number' && err.status >= 500) return true;
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(err.message || '');
}

function isContextLengthError(err) {
  if (err?.status !== 400) return false;
  return CONTEXT_ERROR_RE.test(`${err.message || ''} ${err.detail || ''}`);
}

function isTruncated(result) {
  const reason = result?.finishReason;
  return reason === 'length' || reason === 'max_tokens';
}

/**
 * Ask the model for a JSON object.
 *
 * @param {object} adapter createAIAdapter(...) result
 * @param {string} systemPrompt
 * @param {string} userContent
 * @param {object} options
 *   - timeoutMs, maxRetries, signal, isCancelled, onUsage, label
 * @returns {Promise<object>}
 */
async function callJson(adapter, systemPrompt, userContent, options = {}) {
  const {
    timeoutMs = 180000,
    maxRetries = 2,
    signal,
    isCancelled,
    onUsage,
    label = 'AI',
  } = options;

  if (isCancelled?.()) throw cancelledError();

  const messages = [{ role: 'user', content: userContent }];
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (isCancelled?.()) throw cancelledError();

    let result;
    try {
      result = await withTimeout(
        adapter.complete(systemPrompt, messages, null, { signal }),
        timeoutMs,
        `${label}超时`,
      );
    } catch (err) {
      lastError = err;
      if (isCancelledError(err, isCancelled)) throw cancelledError();
      if (isContextLengthError(err)) {
        throw codedError(`${label}输入超出模型上下文，将缩小批次重试`, 'AI_CONTEXT_LENGTH', { cause: err });
      }
      if (attempt < maxRetries && isRetryableError(err)) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
      throw err;
    }

    onUsage?.(result.usage || {});
    const parsed = extractJsonObject(result.content);
    if (parsed) return parsed;

    if (isTruncated(result)) {
      throw codedError(`${label}输出被截断，将缩小批次重试`, 'AI_TRUNCATED', {
        finishReason: result.finishReason,
      });
    }

    lastError = codedError(`${label}返回的内容不是合法 JSON`, 'AI_BAD_JSON');
    if (attempt < maxRetries) {
      messages.push(
        { role: 'assistant', content: result.content || '' },
        { role: 'user', content: '你上面的输出不是合法 JSON。请重新输出，只输出 JSON 对象，不要代码块、前后缀或解释文字。' },
      );
      continue;
    }
    throw lastError;
  }

  throw lastError || codedError(`${label}调用失败`, 'AI_ERROR');
}

function isSplittableError(err) {
  return ['AI_TRUNCATED', 'AI_CONTEXT_LENGTH', 'AI_BAD_JSON', 'AI_TIMEOUT'].includes(err?.code);
}

/**
 * Process items in batches. On a splittable failure, recursively halve the
 * batch down to one item; a single failing item is reported and skipped.
 * Progress is reported once per top-level batch.
 */
async function processBatches(items, batchSize, worker, options = {}) {
  const list = Array.isArray(items) ? items : [];
  const size = Math.max(1, Math.floor(batchSize) || 1);
  const results = [];

  const runBatch = async (batch) => {
    if (options.isCancelled?.()) throw cancelledError();
    try {
      const result = await worker(batch);
      return Array.isArray(result) ? result : [result];
    } catch (err) {
      if (isCancelledError(err, options.isCancelled)) throw cancelledError();
      if (batch.length > 1 && isSplittableError(err)) {
        const middle = Math.ceil(batch.length / 2);
        const left = await runBatch(batch.slice(0, middle));
        const right = await runBatch(batch.slice(middle));
        return left.concat(right);
      }
      options.onItemError?.(err, batch);
      return [];
    }
  };

  for (let offset = 0; offset < list.length; offset += size) {
    if (options.isCancelled?.()) throw cancelledError();
    const batch = list.slice(offset, offset + size);
    const batchResults = await runBatch(batch);
    results.push(...batchResults);
    options.onProgress?.(Math.min(offset + size, list.length), list.length);
  }

  return results;
}

module.exports = {
  extractJsonObject,
  withTimeout,
  sleep,
  callJson,
  processBatches,
  isSplittableError,
  cancelledError,
  codedError,
};
