/**
 * Display helpers for chapter/volume titles.
 *
 * Imported works keep their original headings ("第一章 风起", "Chapter 1",
 * "楔子"). These helpers avoid prefixing them a second time while still
 * numbering untitled/plain chapters.
 */

import { chapterHeadingBody, isStandaloneChapterHeading, normalizeLine } from './import/headings'

type Translate = (key: string, params?: Record<string, string | number>) => string

/** Ignore spacing/punctuation differences when comparing titles. */
function foldTitle(value: string): string {
  return normalizeLine(value).replace(/[\s：:、.．·\-—_—《》「」“”"'（）()【】]/g, '')
}

/**
 * Drop a leading chapter-heading line that duplicates the chapter title.
 *
 * The editor renders chapter.title above the body, but AI-generated chapters
 * sometimes start with their own heading ("# 第三章 转机"). Imported books used
 * to carry the heading too. Removing that first line here prevents the title
 * from appearing twice; an edited chapter is also cleaned when it is saved.
 */
export function stripLeadingChapterHeading(content: string, title: string): string {
  if (!content) return content
  const lines = content.split('\n')
  let index = 0
  while (index < lines.length && !lines[index].trim()) index++
  if (index >= lines.length) return content

  const raw = normalizeLine(lines[index])
  const isMarkdownHeading = /^#{1,6}\s+/.test(raw)
  const line = raw.replace(/^#{1,6}\s+/, '')
  // A plain "转机" line is not a heading; only labeled headings or Markdown
  // headings are candidates.
  const headingBody = chapterHeadingBody(line) || (isMarkdownHeading ? line : '')
  if (!headingBody) return content

  const storedTitle = normalizeLine(title || '')
  const storedBody = chapterHeadingBody(storedTitle) || storedTitle
  if (!storedBody || foldTitle(headingBody) !== foldTitle(storedBody)) return content

  return lines.slice(index + 1).join('\n')
}

export function formatChapterTitle(num: number, title: string, t: Translate): string {
  const trimmed = (title || '').trim()
  if (!trimmed) return t('sidebar.chapterTitle', { num, title: '' }).trim()
  return isStandaloneChapterHeading(trimmed) ? trimmed : t('sidebar.chapterTitle', { num, title: trimmed })
}
