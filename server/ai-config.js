// AI provider configuration, read from the config database and cached until
// settings change.
const db = require('./db');

let aiConfigCache = null;

function invalidateAiConfigCache() {
  aiConfigCache = null;
}

// Local OpenAI-compatible servers (Ollama, LM Studio…) accept requests
// without a key, so only public endpoints are required to configure one.
function isLocalEndpoint(rawUrl) {
  try {
    const host = new URL(rawUrl || '').hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
  } catch {
    return false;
  }
}

function needsApiKey(aiConfig) {
  return !String(aiConfig.apiKey || '').trim() && !isLocalEndpoint(aiConfig.apiBaseUrl);
}

// Keys and model names are pasted from web pages; trimming here also heals
// values already stored with a stray newline/space, which providers reject
// with confusing auth-header errors.
function cleanConfigValue(value, fallback) {
  return String(value || fallback || '').trim();
}

function getAiConfig() {
  if (aiConfigCache) return aiConfigCache;

  const DEFAULTS = {
    apiBaseUrl: db.DEFAULT_APP_SETTINGS.api_base_url,
    apiKey: process.env.DEEPSEEK_KEY || db.DEFAULT_APP_SETTINGS.api_key,
    apiModel: db.DEFAULT_APP_SETTINGS.api_model,
    apiType: db.DEFAULT_APP_SETTINGS.api_type,
    maxOutputTokens: Number(db.DEFAULT_APP_SETTINGS.max_output_tokens),
  };
  try {
    const rows = db.dbQuery('SELECT key, value FROM app_settings');
    const map = {};
    for (const r of rows) map[r.key] = r.value;
    const apiModel = cleanConfigValue(map.api_model, DEFAULTS.apiModel);
    aiConfigCache = {
      apiBaseUrl: cleanConfigValue(map.api_base_url, DEFAULTS.apiBaseUrl),
      apiKey: cleanConfigValue(map.api_key, DEFAULTS.apiKey),
      apiModel,
      apiType: map.api_type || DEFAULTS.apiType,
      maxOutputTokens: db.resolveMaxOutputTokens(map.max_output_tokens, apiModel),
    };
    return aiConfigCache;
  } catch (e) {
    return { ...DEFAULTS };
  }
}

module.exports = { getAiConfig, invalidateAiConfigCache, needsApiKey, isLocalEndpoint };
