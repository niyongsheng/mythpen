/**
 * Display helpers for chapter/volume titles.
 *
 * Imported works keep their original headings ("第一章 风起", "Chapter 1",
 * "楔子"). These helpers avoid prefixing them a second time while still
 * numbering untitled/plain chapters.
 */

const CHAPTER_HEADING_RE =
  /^(第\s*[0-9０-９零〇一二两三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟]+\s*[章节回话話幕集]|(chapter|chap\.?|ch\.?)\s*(?:[0-9]+|[ivxlcdm]+)\b|序章|序言|序|楔子|引子|前言|后记|尾声|终章|尾章|番外(?:篇)?|外传|附录|完本感言|prologue|epilogue)/i

type Translate = (key: string, params?: Record<string, string | number>) => string

export function formatChapterTitle(num: number, title: string, t: Translate): string {
  const trimmed = (title || '').trim()
  if (!trimmed) return t('sidebar.chapterTitle', { num, title: '' }).trim()
  return CHAPTER_HEADING_RE.test(trimmed) ? trimmed : t('sidebar.chapterTitle', { num, title: trimmed })
}
