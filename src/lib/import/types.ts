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

export type TextEncoding = 'auto' | 'utf-8' | 'gb18030' | 'gbk' | 'big5' | 'utf-16le' | 'utf-16be'

export class ImportError extends Error {
  code: string

  constructor(code: string, message?: string) {
    super(message || code)
    this.name = 'ImportError'
    this.code = code
  }
}
