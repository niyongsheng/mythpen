// ─── AI Provider Adapter ───
// Unified interface for OpenAI-compatible (DeepSeek, etc.) and Anthropic Claude models.
// Auto-detects provider from model name.

const Anthropic = require('@anthropic-ai/sdk');

// ─── Provider detection ───
// apiType takes priority; fallback to model name heuristic

function detectProvider(model, apiType) {
  if (apiType === 'claude') return 'claude';
  if (apiType === 'openai') return 'openai';
  if (!model) return 'openai';
  const m = model.toLowerCase();
  if (m.startsWith('claude') || m.startsWith('anthropic/')) return 'claude';
  return 'openai';
}

// ─── Tool format conversion ───
// OpenAI: { type: 'function', function: { name, description, parameters } }
// Claude: { name, description, input_schema }

function toClaudeTools(openaiTools) {
  if (!openaiTools || openaiTools.length === 0) return undefined;
  return openaiTools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

// ─── Message format conversion ───

/**
 * Merge system-role messages into the provider's top-level system prompt.
 * Claude rejects system roles inside `messages`; several OpenAI-compatible
 * providers reject more than one system message. Keeping a single merged
 * system prompt is the portable form.
 */
function mergeSystemPrompt(systemPrompt, messages) {
  const extra = (messages || [])
    .filter((msg) => msg.role === 'system' && typeof msg.content === 'string' && msg.content.trim())
    .map((msg) => msg.content.trim());
  return [systemPrompt, ...extra].filter(Boolean).join('\n\n');
}

function nonSystemMessages(messages) {
  return (messages || []).filter((msg) => msg.role !== 'system');
}

function toClaudeMessages(openaiMessages) {
  const msgs = [];
  for (const msg of openaiMessages) {
    if (msg.role === 'system') continue; // system is handled separately

    if (msg.role === 'tool') {
      // OpenAI: { role: 'tool', tool_call_id, content }
      // Claude: { role: 'user', content: [{ type: 'tool_result', tool_use_id, content }] }
      msgs.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: msg.tool_call_id, content: msg.content }],
      });
    } else if (msg.role === 'assistant' && msg.tool_calls) {
      // OpenAI: { role: 'assistant', content, tool_calls: [{ id, function: { name, arguments } }] }
      // Claude: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] }
      const content = [];
      if (msg.content) content.push({ type: 'text', text: msg.content });
      for (const tc of msg.tool_calls) {
        let input;
        try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
        content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
      }
      msgs.push({ role: 'assistant', content });
    } else {
      // Regular user/assistant message
      // Claude requires content to be an array when there are tool blocks in conversation
      // but for plain text messages we can use a string
      msgs.push({
        role: msg.role,
        content: msg.content || '',
      });
    }
  }
  return msgs;
}

// ─── Unified response format ───

function makeResponse(content, toolCalls, inputTokens, outputTokens, finishReason) {
  return { content, toolCalls, usage: { inputTokens, outputTokens }, finishReason: finishReason || null };
}

// Default output budget per request. Models are free to split long tool-call
// batches across rounds, but a single response must fit within this limit.
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
// One oversized tool call should not fail the whole run: when the arguments
// are cut off, retry the same round with a larger budget. Reasoning models
// (e.g. DeepSeek Flash) can spend most of `max_tokens` thinking before they
// start emitting the call.
const MAX_RETRY_OUTPUT_TOKENS = 65536;

function apiError(status, text) {
  const detail = String(text || '').slice(0, 500);
  // Surface the provider's own error message (e.g. "Model Not Exist",
  // "invalid api key") instead of a bare status code — these reports can't be
  // diagnosed otherwise.
  const summary = detail.replace(/\s+/g, ' ').trim().slice(0, 220);
  return Object.assign(new Error(`API Error: ${status}${summary ? ` — ${summary}` : ''}`), {
    status,
    detail,
  });
}

// ─── Output-token parameter ───
// OpenAI's newer models (GPT-5+, o-series) reject the legacy `max_tokens`
// parameter with HTTP 400 and require `max_completion_tokens`. Other
// OpenAI-compatible services still expect `max_tokens`. Pick per endpoint and
// learn from 400s at runtime, so Azure OpenAI and proxies heal without an
// extra setting.

// Official host always requires `max_completion_tokens`; other endpoints are
// learned per origin at runtime (host+port, so local servers on different
// ports do not interfere with each other).
const MAX_COMPLETION_TOKENS_HOSTS = new Set(['api.openai.com']);
const MAX_COMPLETION_TOKENS_ORIGINS = new Set();

function chatEndpoint(apiConfig) {
  try {
    const url = new URL(apiConfig.chatUrl || apiConfig.apiBaseUrl || '');
    return { host: url.hostname.toLowerCase(), origin: url.origin };
  } catch {
    return { host: '', origin: '' };
  }
}

/** Name of the output-budget parameter this endpoint accepts. */
function outputLimitField(apiConfig) {
  const { host, origin } = chatEndpoint(apiConfig);
  return MAX_COMPLETION_TOKENS_HOSTS.has(host) || MAX_COMPLETION_TOKENS_ORIGINS.has(origin)
    ? 'max_completion_tokens'
    : 'max_tokens';
}

/** Official OpenAI host, which accepts OpenAI-only extensions such as `stream_options`. */
function isOfficialOpenAI(apiConfig) {
  return chatEndpoint(apiConfig).host === 'api.openai.com';
}

/**
 * POST to an OpenAI-compatible endpoint.
 *
 * `temperature` is deliberately never sent: newer models (e.g. Claude Opus 5,
 * Kimi K3) reject it with HTTP 400, and the provider default is a good fit for
 * the writing workflow.
 *
 * When the endpoint rejects the legacy `max_tokens` parameter (newer OpenAI
 * models do), retry once with `max_completion_tokens` and remember the origin
 * so later requests go straight to the accepted form.
 */
async function postOpenAI(apiConfig, body, signal) {
  const post = (payload) => fetch(apiConfig.chatUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
    body: JSON.stringify(payload),
    signal,
  });

  let response = await post(body);
  if (response.ok) return response;

  let text = await response.text();
  if (response.status === 400 && 'max_tokens' in body && /max_completion_tokens/i.test(text)) {
    const { origin } = chatEndpoint(apiConfig);
    if (origin) MAX_COMPLETION_TOKENS_ORIGINS.add(origin);
    const retried = { ...body, max_completion_tokens: body.max_tokens };
    delete retried.max_tokens;
    response = await post(retried);
    if (response.ok) return response;
    text = await response.text();
  }
  throw apiError(response.status, text);
}

/** Error signalling that a tool call was cut off by the output budget. */
function toolArgsTruncationError(name) {
  return Object.assign(
    new Error(`模型输出达到单次 token 上限，工具「${name}」的参数被截断。请重试，或在设置中调大「最大输出 Token」。`),
    { code: 'TOOL_ARGS_TRUNCATED' },
  );
}

/**
 * Parse a tool call's JSON arguments defensively.
 *
 * When a model hits `max_tokens` mid-way through a tool call, the arguments
 * string is cut off and JSON.parse throws "Unterminated string in JSON…",
 * which used to take down the whole chat stream with a cryptic message.
 */
function parseToolArguments(toolCall, finishReason) {
  const raw = toolCall.function?.arguments ?? '';
  const name = toolCall.function?.name || 'unknown';
  const truncated = finishReason === 'length' || finishReason === 'max_tokens';

  // Empty arguments can also mean the model was cut off before writing any.
  if (!raw.trim()) {
    if (truncated) throw toolArgsTruncationError(name);
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    if (truncated) throw toolArgsTruncationError(name);
    throw Object.assign(
      new Error(`模型返回的工具「${name}」参数不是合法 JSON：${err.message}`),
      { code: 'TOOL_ARGS_INVALID', detail: raw.slice(0, 200) },
    );
  }
}

/**
 * Run one completion round, retrying once with a doubled output budget when a
 * tool call was truncated. Shared by every provider: the "one oversized call
 * should not fail the run" invariant must not depend on the backend.
 */
async function completeWithOutputRetry(initialMaxTokens, attemptOnce) {
  let maxTokens = initialMaxTokens;
  let truncationError = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await attemptOnce(maxTokens);
    } catch (err) {
      if (err.code !== 'TOOL_ARGS_TRUNCATED' || truncationError || maxTokens >= MAX_RETRY_OUTPUT_TOKENS) {
        // The retry failed (for example because the model caps `max_tokens`
        // below the new value). Surface the original, actionable truncation.
        throw truncationError || err;
      }
      truncationError = err;
      const nextTokens = Math.min(maxTokens * 2, MAX_RETRY_OUTPUT_TOKENS);
      console.warn(`[AI Adapter] Tool call truncated at max_tokens=${maxTokens}; retrying with ${nextTokens}`);
      maxTokens = nextTokens;
    }
  }
}

// ═══════════════════════════════════════════
// OPENAI PROVIDER (DeepSeek / any OpenAI-compatible API)
// ═══════════════════════════════════════════

class OpenAIProvider {
  constructor(apiConfig) {
    this.apiConfig = apiConfig;
  }

  /**
   * Non-streaming chat completion (supports tools).
   * Used by the tool-call loop in /api/ai/chat/stream.
   */
  async complete(systemPrompt, messages, tools, options = {}) {
    const { apiConfig } = this;

    return completeWithOutputRetry(
      apiConfig.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
      async (maxTokens) => {
        const body = {
          model: apiConfig.apiModel,
          messages: [
            { role: 'system', content: mergeSystemPrompt(systemPrompt, messages) },
            ...nonSystemMessages(messages),
          ],
          tools: tools || undefined,
          [outputLimitField(apiConfig)]: maxTokens,
          stream: false,
        };

        const response = await postOpenAI(apiConfig, body, options.signal);
        const data = await response.json();
        const choice = data.choices?.[0];
        const msg = choice?.message;
        const finishReason = choice?.finish_reason;
        const inputTokens = data.usage?.prompt_tokens || 0;
        const outputTokens = data.usage?.completion_tokens || 0;

        const toolCalls = (msg?.tool_calls || []).map(tc => ({
          id: tc.id,
          name: tc.function.name,
          args: parseToolArguments(tc, finishReason),
        }));
        return makeResponse(msg?.content || null, toolCalls, inputTokens, outputTokens, finishReason);
      },
    );
  }

  /**
   * Streaming chat completion (no tools).
   * Used by /api/ai/continue.
   */
  async *stream(systemPrompt, messages) {
    const { apiConfig } = this;
    const body = {
      model: apiConfig.apiModel,
      messages: [
        { role: 'system', content: mergeSystemPrompt(systemPrompt, messages) },
        ...nonSystemMessages(messages),
      ],
      [outputLimitField(apiConfig)]: apiConfig.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
      stream: true,
    };
    // Official OpenAI omits `usage` from streamed chunks unless asked for it.
    if (isOfficialOpenAI(apiConfig)) {
      body.stream_options = { include_usage: true };
    }

    const response = await postOpenAI(apiConfig, body);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            yield { type: 'chunk', text: delta.content };
          }
          if (parsed.usage) {
            yield { type: 'usage', inputTokens: parsed.usage.prompt_tokens || 0, outputTokens: parsed.usage.completion_tokens || 0 };
          }
        } catch { /* skip parse errors */ }
      }
    }
  }
}

// ═══════════════════════════════════════════
// CLAUDE PROVIDER (Anthropic)
// ═══════════════════════════════════════════

class ClaudeProvider {
  constructor(apiConfig) {
    this.apiConfig = apiConfig;
    this.client = new Anthropic({ apiKey: apiConfig.apiKey });
  }

  /**
   * Non-streaming chat completion (supports tools).
   */
  async complete(systemPrompt, messages, tools, options = {}) {
    const { apiConfig, client } = this;

    return completeWithOutputRetry(
      apiConfig.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
      async (maxTokens) => {
        const claudeTools = toClaudeTools(tools);
        // The system prompt and tool schemas are a stable prefix across every
        // round of the tool loop. Marking them ephemeral lets Anthropic reuse
        // the cached prefix instead of re-billing the whole ~6k-token block.
        if (claudeTools && claudeTools.length > 0) {
          claudeTools[claudeTools.length - 1] = {
            ...claudeTools[claudeTools.length - 1],
            cache_control: { type: 'ephemeral' },
          };
        }
        const params = {
          model: apiConfig.apiModel,
          system: [{
            type: 'text',
            text: mergeSystemPrompt(systemPrompt, messages),
            cache_control: { type: 'ephemeral' },
          }],
          messages: toClaudeMessages(messages),
          max_tokens: maxTokens,
        };

        if (claudeTools && claudeTools.length > 0) {
          params.tools = claudeTools;
        }

        const response = await client.messages.create(
          params,
          options.signal ? { signal: options.signal } : undefined,
        );
        const toolCalls = [];
        let content = '';

        for (const block of response.content) {
          if (block.type === 'text') {
            content += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({ id: block.id, name: block.name, args: block.input });
          }
        }

        // A response cut off inside a tool call carries partial arguments;
        // retry the round with a larger budget instead of executing them.
        if (response.stop_reason === 'max_tokens' && toolCalls.length > 0) {
          throw toolArgsTruncationError(toolCalls[0].name);
        }

        const inputTokens = response.usage?.input_tokens || 0;
        const outputTokens = response.usage?.output_tokens || 0;

        return makeResponse(content || null, toolCalls, inputTokens, outputTokens, response.stop_reason);
      },
    );
  }

  /**
   * Streaming chat completion (no tools).
   */
  async *stream(systemPrompt, messages) {
    const { apiConfig } = this;

    const params = {
      model: apiConfig.apiModel,
      system: mergeSystemPrompt(systemPrompt, messages),
      messages: toClaudeMessages(messages),
      max_tokens: apiConfig.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
    };

    yield* this._streamOnce(params);
  }

  async *_streamOnce(params) {
    const stream = this.client.messages.stream(params);
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        yield { type: 'chunk', text: event.delta.text };
      }
      if (event.type === 'message_delta') {
        if (event.usage) {
          outputTokens = event.usage.output_tokens || 0;
        }
      }
      if (event.type === 'message_start') {
        if (event.message?.usage) {
          inputTokens = event.message.usage.input_tokens || 0;
        }
      }
    }

    yield { type: 'usage', inputTokens, outputTokens };
  }
}

// ═══════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════

function createAIAdapter(model, apiConfig, apiType) {
  const provider = detectProvider(model, apiType);
  console.log(`[AI Adapter] Using ${provider} provider for model "${model}" (apiType: ${apiType || 'auto'})`);

  // Ensure chatUrl is set for OpenAI-compatible
  if (provider === 'openai') {
    const baseUrl = apiConfig.apiBaseUrl || 'https://api.deepseek.com';
    apiConfig.chatUrl = baseUrl.replace(/\/?$/, '') + '/chat/completions';
  }

  switch (provider) {
    case 'claude':
      return new ClaudeProvider(apiConfig);
    case 'openai':
    default:
      return new OpenAIProvider(apiConfig);
  }
}

module.exports = { createAIAdapter, OpenAIProvider, ClaudeProvider, detectProvider };
