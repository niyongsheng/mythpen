import { decodeTextBuffer } from './decode'
import {
  matchChapterHeading,
  matchNormalizedChapterHeading,
  matchNormalizedVolumeHeading,
  matchVolumeHeading,
  normalizeLine,
} from './headings'
import { BIG_CHAPTER_CHARS } from './limits'
import type { ImportWarning, ParsedBook, ParsedChapter, ParsedVolume, TextEncoding } from './types'

export interface TxtParseOptions {
  encoding?: TextEncoding
}

interface ChapterAcc {
  title: string
  lines: string[]
}

interface VolumeAcc {
  title: string
  chapters: ParsedChapter[]
}

export function titleFromFileName(fileName: string): string {
  return (
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .trim() || '未命名作品'
  )
}

function normalizeText(text: string): string {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/​|‌|‍|﻿/g, '')
    .replace(/\n{3,}/g, '\n\n')
}

function countWords(text: string): number {
  return text.replace(/\s/g, '').length
}

function containsChapterMarkers(lines: string[]): boolean {
  let count = 0
  for (const line of lines) {
    if (matchChapterHeading(line)) {
      count += 1
      if (count >= 3) return true
    }
  }
  return false
}

function splitByVolumeMarkers(lines: string[], defaultTitle: string, warnings: ImportWarning[]): ParsedVolume[] {
  const volumes: ParsedVolume[] = []
  let currentTitle = ''
  let buffer: string[] = []

  const flush = () => {
    const content = buffer.join('\n').trim()
    if (content) {
      volumes.push({
        title: currentTitle || defaultTitle,
        chapters: [{ title: currentTitle || defaultTitle, content }],
      })
    }
    buffer = []
  }

  for (const line of lines) {
    const volumeTitle = matchVolumeHeading(line)
    if (volumeTitle) {
      flush()
      currentTitle = volumeTitle
      continue
    }
    buffer.push(line)
  }
  flush()

  if (volumes.length > 1) warnings.push({ code: 'perVolumeSingleChapter' })
  return volumes
}

function parseWithMarkers(lines: string[], defaultTitle: string, warnings: ImportWarning[]): ParsedVolume[] {
  const volumes: VolumeAcc[] = []
  let currentVolume: VolumeAcc | null = null
  let currentChapter: ChapterAcc | null = null
  let chapterPrefix: string[] = []
  let volumePreamble: string[] = []
  let preface: string[] = []
  let droppedEmpty = 0

  const ensureVolume = (title?: string): VolumeAcc => {
    if (!currentVolume) {
      currentVolume = { title: title || defaultTitle, chapters: [] }
      volumes.push(currentVolume)
    }
    return currentVolume
  }

  const pushChapter = (title: string, content: string) => {
    if (!content.trim()) {
      droppedEmpty += 1
      return
    }
    ensureVolume().chapters.push({ title, content })
  }

  const flushChapter = () => {
    if (!currentChapter) return
    const content = [...chapterPrefix, ...currentChapter.lines].join('\n').trim()
    chapterPrefix = []
    pushChapter(currentChapter.title, content)
    currentChapter = null
  }

  const flushVolumePreamble = () => {
    const content = volumePreamble.join('\n').trim()
    volumePreamble = []
    if (!content) return
    if (containsChapterMarkers(content.split('\n')) || content.length > 2000) return
    if (content.length > 200) {
      ensureVolume().chapters.push({ title: '卷首语', content })
    } else if (currentVolume && currentVolume.chapters.length > 0) {
      currentVolume.chapters[0].content = `${content}\n\n${currentVolume.chapters[0].content}`
    } else {
      chapterPrefix = content.split('\n')
    }
  }

  const flushVolume = () => {
    flushChapter()
    flushVolumePreamble()
    // A short preamble that never received a chapter must not leak into the
    // next volume's first chapter.
    chapterPrefix = []
    currentVolume = null
  }

  const flushPreface = () => {
    const content = preface.join('\n').trim()
    preface = []
    if (!content || content.length < 100) return
    // A table of contents at the start of a TXT file looks like many chapter
    // headings with no body text; drop it instead of importing it.
    if (containsChapterMarkers(content.split('\n'))) return
    if (content.length > 2000) return
    volumes.push({ title: '序', chapters: [{ title: '前言', content }] })
  }

  for (const rawLine of lines) {
    // Preserve leading indentation in body text; only headings are trimmed.
    const line = rawLine.replace(/ /g, ' ').replace(/[ \t]+$/g, '')
    const headingLine = normalizeLine(rawLine)
    const volumeTitle = matchNormalizedVolumeHeading(headingLine)
    if (volumeTitle) {
      flushVolume()
      flushPreface()
      currentVolume = { title: volumeTitle, chapters: [] }
      volumes.push(currentVolume)
      continue
    }

    const chapterTitle = matchNormalizedChapterHeading(headingLine)
    if (chapterTitle) {
      flushPreface()
      flushChapter()
      flushVolumePreamble()
      ensureVolume()
      currentChapter = { title: chapterTitle, lines: [] }
      continue
    }

    if (currentChapter) currentChapter.lines.push(line)
    else if (currentVolume) volumePreamble.push(line)
    else preface.push(line)
  }

  flushVolume()
  flushPreface()

  if (droppedEmpty > 0) warnings.push({ code: 'emptyChaptersSkipped', count: droppedEmpty })
  return volumes
    .map((volume) => ({
      title: volume.title,
      chapters: volume.chapters.filter((ch) => ch.content.trim().length > 0),
    }))
    .filter((volume) => volume.chapters.length > 0)
}

export function finalizeBook(
  volumes: ParsedVolume[],
  meta: {
    title: string
    author?: string
    format: 'txt' | 'epub'
    language?: string
    description?: string
    warnings: ImportWarning[]
  },
): ParsedBook {
  let totalChapters = 0
  let totalWords = 0
  let biggestChapter = 0
  for (const volume of volumes) {
    for (const chapter of volume.chapters) {
      totalChapters += 1
      const words = countWords(chapter.content)
      totalWords += words
      if (words > biggestChapter) biggestChapter = words
    }
  }

  const warnings = [...meta.warnings]
  if (biggestChapter > BIG_CHAPTER_CHARS) warnings.push({ code: 'bigChapter', value: biggestChapter })

  return {
    title: meta.title,
    author: meta.author,
    description: meta.description,
    language: meta.language,
    format: meta.format,
    volumes,
    totalChapters,
    totalWords,
    warnings,
  }
}

export function parseTxtText(
  rawText: string,
  fileName: string,
  initialWarnings: ImportWarning[],
  title?: string,
): ParsedBook {
  const text = normalizeText(rawText)
  const lines = text.split('\n')
  const bookTitle = title || titleFromFileName(fileName)
  const warnings = [...initialWarnings]

  const hasVolumeMarkers = lines.some((line) => matchVolumeHeading(line) !== null)
  const hasChapterMarkers = lines.some((line) => matchChapterHeading(line) !== null)

  let volumes: ParsedVolume[]

  if (!hasChapterMarkers) {
    warnings.push({ code: 'noChapterMarkers' })
    if (hasVolumeMarkers) {
      volumes = splitByVolumeMarkers(lines, bookTitle, warnings)
    } else {
      const content = text.trim()
      volumes = content ? [{ title: '正文', chapters: [{ title: bookTitle, content }] }] : []
    }
  } else {
    volumes = parseWithMarkers(lines, bookTitle, warnings)
  }

  if (volumes.length === 0) {
    const content = text.trim()
    if (content) volumes = [{ title: '正文', chapters: [{ title: bookTitle, content }] }]
  }

  return finalizeBook(volumes, { title: bookTitle, format: 'txt', warnings })
}

export function parseTxt(buffer: ArrayBuffer, fileName: string, options: TxtParseOptions = {}): ParsedBook {
  const decoded = decodeTextBuffer(buffer, options.encoding || 'auto')
  return parseTxtText(decoded.text, fileName, decoded.warnings)
}
