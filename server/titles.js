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

/** Title text after the chapter label ("第三章 转机" → "转机"), '' otherwise. */
function chapterHeadingBody(line) {
  const trimmed = String(line || '').replace(/^\s{0,3}#{1,6}\s+/, '').trim();
  if (!CHAPTER_LABEL_RE.test(trimmed)) return '';
  return trimmed.replace(CHAPTER_LABEL_RE, '').replace(/^[\s：:、.．·\-—_—]+/, '').trim();
}

/** Ignore spacing/punctuation differences when comparing titles. */
function foldTitle(value) {
  return String(value || '').replace(/[\s：:、.．·\-—_—《》「」“”"'（）()【】]/g, '');
}

/**
 * Drop a leading chapter-heading line that duplicates chapter.title.
 *
 * Mirrors stripLeadingChapterHeading() in src/lib/chapterTitle.ts. Content is
 * normalized on write and on export so AI-generated and legacy chapters don't
 * render the title twice.
 */
function stripLeadingChapterHeading(content, chapter) {
  if (typeof content !== 'string' || !content) return content;
  const lines = content.split('\n');
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index++;
  if (index >= lines.length) return content;

  const raw = lines[index].trim();
  const isMarkdownHeading = /^#{1,6}\s+/.test(raw);
  const line = raw.replace(/^#{1,6}\s+/, '');
  const headingBody = chapterHeadingBody(line) || (isMarkdownHeading ? line : '');
  if (!headingBody) return content;

  const title = String((chapter && chapter.title) || '').trim();
  const titleBody = chapterHeadingBody(title) || title;
  if (!titleBody || foldTitle(headingBody) !== foldTitle(titleBody)) return content;

  return lines.slice(index + 1).join('\n');
}

module.exports = {
  chapterHeading,
  volumeHeading,
  chapterHeadingBody,
  stripLeadingChapterHeading,
  CHAPTER_LABEL_RE,
  VOLUME_LABEL_RE,
};
