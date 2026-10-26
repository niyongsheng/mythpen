// Writing styles are orthogonal to genres. Each style can shape prompts and
// bind creative elements (爽文 → 爽点看板, 悬疑推理 → 线索板).
const STYLES = [
  { key: 'dark', label: '暗黑' },
  { key: 'realistic', label: '写实' },
  { key: 'healing', label: '治愈' },
  { key: 'poetic', label: '诗意' },
  { key: 'power-fantasy', label: '爽文' },
  { key: 'light', label: '轻快' },
];

const STYLE_LABELS = Object.fromEntries(STYLES.map((style) => [style.key, style.label]));
const ALLOWED_STYLES = new Set(STYLES.map((style) => style.key));

module.exports = { STYLES, STYLE_LABELS, ALLOWED_STYLES };
