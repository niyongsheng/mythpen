// Genre-aware setting categories. Sci-fi keeps its hardness labels
// (known/extrapolation/hypothesis); the other genres group entries by category.
const SETTING_CATEGORY_PRESETS = {
  fantasy: ['realm', 'technique', 'artifact', 'sect', 'other'],
  xianxia: ['realm', 'technique', 'artifact', 'sect', 'other'],
  wuxia: ['martial-art', 'school', 'weapon', 'other'],
  game: ['system', 'skill', 'equipment', 'dungeon', 'other'],
};

const ALLOWED_SETTING_CATEGORIES = new Set([
  ...new Set(Object.values(SETTING_CATEGORY_PRESETS).flat()),
]);

module.exports = { SETTING_CATEGORY_PRESETS, ALLOWED_SETTING_CATEGORIES };
