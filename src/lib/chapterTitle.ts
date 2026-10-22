/**
 * Display helpers for chapter/volume titles.
 *
 * Imported works keep their original headings ("第一章 风起", "Chapter 1",
 * "楔子"). These helpers avoid prefixing them a second time while still
 * numbering untitled/plain chapters.
 */

import { isStandaloneChapterHeading } from './import/headings'

type Translate = (key: string, params?: Record<string, string | number>) => string

export function formatChapterTitle(num: number, title: string, t: Translate): string {
  const trimmed = (title || '').trim()
  if (!trimmed) return t('sidebar.chapterTitle', { num, title: '' }).trim()
  return isStandaloneChapterHeading(trimmed) ? trimmed : t('sidebar.chapterTitle', { num, title: trimmed })
}
