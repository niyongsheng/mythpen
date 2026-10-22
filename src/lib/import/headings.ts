/**
 * Heading detection shared by the TXT parser and EPUB fallback splitting.
 * Matches whole lines only, with conservative length/punctuation checks to
 * avoid treating narrative sentences as chapter titles.
 */

const CN_NUM = '[0-9０-９零〇一二两三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟]+'

export const VOLUME_RE = new RegExp(
  `^(?:第\\s*${CN_NUM}\\s*[卷部集]|卷\\s*${CN_NUM}|(?:volume|book|part)\\s*(?:[0-9]+|[ivxlcdm]+)|上卷|中卷|下卷|上部|中部|下部)` +
    `(?:\\s*[：:、.．·\\-—]?\\s*(.*))?$`,
  'i',
)

export const CHAPTER_RE = new RegExp(
  `^(?:第\\s*${CN_NUM}\\s*[章节回话話幕集]|(?:chapter|chap\\.?|ch\\.?)\\s*(?:[0-9]+|[ivxlcdm]+)|` +
    `序章|序言|序|楔子|引子|前言|后记|尾声|终章|尾章|番外(?:篇)?|外传|附录|完本感言|prologue|epilogue)` +
    `(?:\\s*[：:、.．·\\-—]?\\s*(.*))?$`,
  'i',
)

// If the text right after "第X章" looks like a sentence continuation, it is
// almost certainly not a heading ("第一章的内容，讲的是……").
const NARRATIVE_TAIL_RE = /^(的|是|中|里|内|内容|讲|写|说|将|会|有|在|被|把|让|使|对|和|与|为|要|不|没)/
const SENTENCE_PUNCT_RE = /[。！？；]/

export function normalizeLine(line: string): string {
  return line
    .replace(/ /g, ' ')
    .replace(/[ \t　]+$/g, '')
    .trim()
}

function isPlausibleHeading(line: string, maxLength: number): boolean {
  if (!line || line.length > maxLength) return false
  if (SENTENCE_PUNCT_RE.test(line)) return false
  if (line.includes('，') && line.length > 25) return false
  return true
}

export function matchChapterHeading(line: string): string | null {
  const trimmed = normalizeLine(line)
  if (!isPlausibleHeading(trimmed, 40)) return null
  const match = trimmed.match(CHAPTER_RE)
  if (!match) return null
  const tail = (match[1] || '').trim()
  if (tail && NARRATIVE_TAIL_RE.test(tail)) return null
  return trimmed
}

export function matchVolumeHeading(line: string): string | null {
  const trimmed = normalizeLine(line)
  if (!isPlausibleHeading(trimmed, 50)) return null
  return VOLUME_RE.test(trimmed) ? trimmed : null
}

/** True when a stored chapter title already carries its own numbering. */
export function isStandaloneChapterHeading(title: string): boolean {
  const trimmed = normalizeLine(title)
  return trimmed.length > 0 && trimmed.length <= 80 && CHAPTER_RE.test(trimmed)
}

export function isStandaloneVolumeHeading(title: string): boolean {
  const trimmed = normalizeLine(title)
  return trimmed.length > 0 && trimmed.length <= 80 && VOLUME_RE.test(trimmed)
}
