// Genre-aware default categories. Every setting-heavy genre groups entries by
// category; sci-fi additionally keeps its hardness label
// (known/extrapolation/hypothesis) as a second axis.
const SETTING_CATEGORY_PRESETS = {
  'sci-fi': [
    'tech',
    'biology',
    'physics',
    'society',
    'politics',
    'military',
    'ai',
    'alien',
    'planet',
    'history',
    'other',
  ],
  fantasy: ['realm', 'technique', 'artifact', 'sect', 'other'],
  xianxia: ['realm', 'technique', 'artifact', 'sect', 'other'],
  wuxia: ['martial-art', 'school', 'weapon', 'other'],
  game: ['system', 'skill', 'equipment', 'dungeon', 'other'],
};

const ALLOWED_SETTING_CATEGORIES = new Set([
  ...new Set(Object.values(SETTING_CATEGORY_PRESETS).flat()),
]);

// Genres that get the settings/science page. Pages hidden by genre must not be
// writable by the AI or populated by imports, otherwise entities land in a page
// the author cannot open or manage.
const SETTING_PAGE_GENRES = Object.keys(SETTING_CATEGORY_PRESETS);

module.exports = { SETTING_CATEGORY_PRESETS, ALLOWED_SETTING_CATEGORIES, SETTING_PAGE_GENRES };
