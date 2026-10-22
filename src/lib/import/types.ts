export type ImportFormat = 'txt' | 'epub'

export interface ParsedChapter {
  title: string
  content: string
}

export interface ParsedVolume {
  title: string
  chapters: ParsedChapter[]
}

export interface ImportWarning {
  code:
    | 'noChapterMarkers'
    | 'perVolumeSingleChapter'
    | 'emptyChaptersSkipped'
    | 'bigChapter'
    | 'encodingFallback'
    | 'tocIncomplete'
    | 'fragmentFallback'
    | 'unknownEncoding'
  count?: number
  value?: number
}

export interface ParsedBook {
  title: string
  fileName?: string
  author?: string
  description?: string
  language?: string
  format: ImportFormat
  volumes: ParsedVolume[]
  totalChapters: number
  totalWords: number
  warnings: ImportWarning[]
}

/** A decoded/packed source file ready to send to the AI import endpoint. */
export interface ImportSource {
  fileName: string
  format: ImportFormat
  text: string
  title?: string
  author?: string
  description?: string
  language?: string
  warnings: ImportWarning[]
}

export interface ImportProgress {
  stage: string
  message?: string
  current?: number
  total?: number
}

export interface ImportResult {
  project: string
  volumes: number
  chapters: number
  characters: number
  chapterLinks?: number
  relations: number
  world: number
  timeline: number
  foreshadows: number
  memories: number
  science: number
  wordCount: number
  warnings?: string[]
  usage?: { inputTokens: number; outputTokens: number } | null
}

export type TextEncoding = 'auto' | 'utf-8' | 'gb18030' | 'gbk' | 'big5' | 'utf-16le' | 'utf-16be'

export class ImportError extends Error {
  code: string

  constructor(code: string, message?: string) {
    super(message || code)
    this.name = 'ImportError'
    this.code = code
  }
}
