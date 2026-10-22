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

function apiError(status, text) {
  return Object.assign(new Error(`API Error: ${status}`), {
    status,
    detail: String(text || '').slice(0, 500),
  });
}

/**
 * POST to an OpenAI-compatible endpoint.
 *
 * `temperature` is deliberately never sent: newer models (e.g. Claude Opus 5,
 * Kimi K3) reject it with HTTP 400, and the provider default is a good fit for
 * the writing workflow.
 */
async function postOpenAI(apiConfig, body, signal) {
  const response = await fetch(apiConfig.chatUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
    body: JSON.stringify(body),
    signal,
  });
  if (response.ok) return response;
  throw apiError(response.status, await response.text());
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
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    const name = toolCall.function?.name || 'unknown';
    if (finishReason === 'length') {
      throw Object.assign(
        new Error(`模型输出达到单次 token 上限，工具「${name}」的参数被截断。请重试，或在设置中调大「最大输出 Token」。`),
        { code: 'TOOL_ARGS_TRUNCATED' },
      );
    }
    throw Object.assign(
      new Error(`模型返回的工具「${name}」参数不是合法 JSON：${err.message}`),
      { code: 'TOOL_ARGS_INVALID', detail: raw.slice(0, 200) },
    );
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
    const body = {
      model: apiConfig.apiModel,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools: tools || undefined,
      max_tokens: apiConfig.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
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
  }

  /**
   * Streaming chat completion (no tools).
   * Used by /api/ai/continue.
   */
  async *stream(systemPrompt, messages) {
    const { apiConfig } = this;
    const body = {
      model: apiConfig.apiModel,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: apiConfig.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
      stream: true,
    };

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

    const params = {
      model: apiConfig.apiModel,
      system: systemPrompt,
      messages: toClaudeMessages(messages),
      max_tokens: apiConfig.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
    };

    if (tools && tools.length > 0) {
      params.tools = toClaudeTools(tools);
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

    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;

    return makeResponse(content || null, toolCalls, inputTokens, outputTokens, response.stop_reason);
  }

  /**
   * Streaming chat completion (no tools).
   */
  async *stream(systemPrompt, messages) {
    const { apiConfig } = this;

    const params = {
      model: apiConfig.apiModel,
      system: systemPrompt,
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
