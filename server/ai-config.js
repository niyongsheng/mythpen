// AI provider configuration, read from the config database and cached until
// settings change.
const db = require('./db');

let aiConfigCache = null;

function invalidateAiConfigCache() {
  aiConfigCache = null;
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
    const apiModel = map.api_model || DEFAULTS.apiModel;
    aiConfigCache = {
      apiBaseUrl: map.api_base_url || DEFAULTS.apiBaseUrl,
      apiKey: map.api_key || DEFAULTS.apiKey,
      apiModel,
      apiType: map.api_type || DEFAULTS.apiType,
      maxOutputTokens: db.resolveMaxOutputTokens(map.max_output_tokens, apiModel),
    };
    return aiConfigCache;
  } catch (e) {
    return { ...DEFAULTS };
  }
}

module.exports = { getAiConfig, invalidateAiConfigCache };
