/**
 * Chapter/volume heading formatting shared by prompts and export.
 *
 * Imported and AI-generated titles may already carry a label
 * ("第一章 风起", "第一卷 · 完美样本"). These helpers avoid prefixing the
 * label a second time. The grammar mirrors src/lib/import/headings.ts so
 * display, prompts and export all recognize the same headings.
 */

const CN_NUM = '[0-9０-９零〇一二两三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟]+';

const VOLUME_LABEL_RE = new RegExp(
  `^(?:第\\s*${CN_NUM}\\s*[卷部集]|卷\\s*${CN_NUM}|(?:volume|book|part)\\s*(?:[0-9]+|[ivxlcdm]+)|上卷|中卷|下卷|上部|中部|下部)`,
  'i',
);

const CHAPTER_LABEL_RE = new RegExp(
  `^(?:第\\s*${CN_NUM}\\s*[章节回话話幕集]|(?:chapter|chap\\.?|ch\\.?)\\s*(?:[0-9]+|[ivxlcdm]+)|` +
    `序章|序言|序|楔子|引子|前言|后记|尾声|终章|尾章|番外(?:篇)?|外传|附录|完本感言|prologue|epilogue)`,
  'i',
);

function chapterHeading(ch) {
  const title = (ch.title || '').trim();
  if (!title) return `第${ch.num}章`;
  return CHAPTER_LABEL_RE.test(title) ? title : `第${ch.num}章 ${title}`;
}

function volumeHeading(vol) {
  const title = (vol.title || '').trim();
  if (!title) return `第${vol.sort_order}卷`;
  return VOLUME_LABEL_RE.test(title) ? title : `第${vol.sort_order}卷 ${title}`;
}

module.exports = { chapterHeading, volumeHeading };
