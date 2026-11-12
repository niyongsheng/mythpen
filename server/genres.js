// Canonical genre keys. `project_genres` stores these slugs, never display
// labels — the UI translates them and feature gating (sidebar pages, science
// categories) matches on them.
const ALLOWED_GENRES = new Set([
  'sci-fi',
  'fantasy',
  'xianxia',
  'wuxia',
  'romance',
  'history',
  'urban',
  'mystery',
  'game',
  'biography',
  'other',
]);

// Early builds and unfiltered imports could persist localized labels instead
// of slugs. Map them back so labels, icons and genre-aware pages keep working.
const LEGACY_GENRE_LABELS = {
  '科幻': 'sci-fi',
  '玄幻': 'fantasy',
  '仙侠': 'xianxia',
  '仙俠': 'xianxia',
  '武侠': 'wuxia',
  '武俠': 'wuxia',
  '言情': 'romance',
  '历史': 'history',
  '歷史': 'history',
  '都市': 'urban',
  '悬疑': 'mystery',
  '懸疑': 'mystery',
  '游戏': 'game',
  '遊戲': 'game',
  '传记': 'biography',
  '傳記': 'biography',
  '其他': 'other',
  // 爽文 is a writing style now; callers handle this value as a style flag.
  '爽文': 'power-fantasy',
};

/**
 * Resolve a stored genre value to its canonical key.
 * @returns {string|null} the slug, or null when the value is unknown.
 */
function normalizeGenre(value) {
  const label = typeof value === 'string' ? value.trim() : '';
  if (!label) return null;
  if (ALLOWED_GENRES.has(label)) return label;
  return LEGACY_GENRE_LABELS[label] || null;
}

module.exports = { ALLOWED_GENRES, LEGACY_GENRE_LABELS, normalizeGenre };
