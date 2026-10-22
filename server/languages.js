/**
 * Single source of truth for project writing languages.
 *
 * Codes match the UI locale codes used by src/i18n. `name` is what gets
 * injected into AI prompts; `perChapterTokens` sizes import enrichment
 * batches (CJK chapters need roughly twice the output budget of Latin ones).
 */
const SUPPORTED_LANGUAGES = {
  zh: { name: '简体中文 (Simplified Chinese)', perChapterTokens: 650 },
  'zh-TW': { name: '繁體中文 (Traditional Chinese)', perChapterTokens: 650 },
  en: { name: 'English', perChapterTokens: 350 },
  ja: { name: '日本語 (Japanese)', perChapterTokens: 650 },
  ko: { name: '한국어 (Korean)', perChapterTokens: 650 },
  fr: { name: 'Français (French)', perChapterTokens: 350 },
  es: { name: 'Español (Spanish)', perChapterTokens: 350 },
  ru: { name: 'Русский (Russian)', perChapterTokens: 450 },
};

const DEFAULT_LANGUAGE = 'zh';
const LANGUAGE_CODES = new Set(Object.keys(SUPPORTED_LANGUAGES));

/** Return a supported code, falling back to the default. */
function normalizeLanguageCode(value) {
  return LANGUAGE_CODES.has(value) ? value : DEFAULT_LANGUAGE;
}

/** Human-readable name used in prompts. */
function languageName(code) {
  return SUPPORTED_LANGUAGES[code]?.name || SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE].name;
}

/** Approximate output-token cost of one chapter in this language. */
function perChapterTokens(code) {
  return SUPPORTED_LANGUAGES[code]?.perChapterTokens || SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE].perChapterTokens;
}

module.exports = {
  SUPPORTED_LANGUAGES,
  LANGUAGE_CODES,
  DEFAULT_LANGUAGE,
  normalizeLanguageCode,
  languageName,
  perChapterTokens,
};
