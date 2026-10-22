import type { WritingLanguage } from '@/types'
import { decodeTextBuffer } from './decode'
import { parseEpub } from './epub'
import { MAX_FILE_BYTES, MAX_TEXT_CHARS } from './limits'
import { titleFromFileName } from './txt'
import type { ImportSource, ParsedBook, TextEncoding } from './types'
import { ImportError } from './types'

export interface ExtractImportOptions {
  encoding?: TextEncoding
}

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index === -1 ? '' : fileName.slice(index + 1).toLowerCase()
}

// EPUB metadata uses a wide range of BCP 47 tags. Map both the full tag and
// the primary subtag onto the language codes used by the app.
const LANGUAGE_ALIASES: Record<string, WritingLanguage> = {
  zh: 'zh',
  'zh-cn': 'zh',
  'zh-hans': 'zh',
  'zh-sg': 'zh',
  'zh-tw': 'zh-TW',
  'zh-hk': 'zh-TW',
  'zh-mo': 'zh-TW',
  'zh-hant': 'zh-TW',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
  fr: 'fr',
  es: 'es',
  ru: 'ru',
}

function normalizeLanguage(value?: string): WritingLanguage | undefined {
  const language = (value || '').trim().toLowerCase().replace(/_/g, '-')
  if (!language) return undefined
  return LANGUAGE_ALIASES[language] ?? LANGUAGE_ALIASES[language.split('-')[0]]
}

/** Rebuild plain text from the EPUB extractor, keeping every chapter title. */
function epubBookToText(book: ParsedBook): string {
  const parts: string[] = []
  for (const volume of book.volumes) {
    if (volume.title) parts.push(volume.title)
    for (const chapter of volume.chapters) {
      const title = chapter.title.trim()
      const content = chapter.content.trim()
      if (title && content && !content.startsWith(title)) parts.push(title)
      else if (title && !content) parts.push(title)
      if (content) parts.push(content)
    }
  }
  return parts.join('\n\n')
}

/**
 * Read a TXT/EPUB file and return the canonical text plus metadata. No
 * chapter/volume detection happens here; the server sends the text to the AI.
 */
export async function extractImportSource(file: File, options: ExtractImportOptions = {}): Promise<ImportSource> {
  if (file.size > MAX_FILE_BYTES) {
    throw new ImportError('FILE_TOO_LARGE', `文件超过 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB 上限`)
  }

  const extension = extensionOf(file.name)

  if (extension === 'txt') {
    const decoded = decodeTextBuffer(await file.arrayBuffer(), options.encoding || 'auto')
    if (decoded.text.length > MAX_TEXT_CHARS) {
      throw new ImportError('FILE_TOO_LARGE', '正文内容过大，请拆分后分项目导入')
    }
    if (!decoded.text.trim()) {
      throw new ImportError('EMPTY_BOOK', '未检测到可导入的正文')
    }
    return {
      fileName: file.name,
      format: 'txt',
      text: decoded.text,
      title: titleFromFileName(file.name),
      warnings: decoded.warnings,
    }
  }

  if (extension === 'epub') {
    const book = await parseEpub(file)
    const text = epubBookToText(book)
    if (!text.trim()) {
      throw new ImportError('EMPTY_BOOK', '未检测到可导入的正文')
    }
    if (text.length > MAX_TEXT_CHARS) {
      throw new ImportError('FILE_TOO_LARGE', '正文内容过大，请拆分后分项目导入')
    }
    return {
      fileName: file.name,
      format: 'epub',
      text,
      title: book.title,
      author: book.author,
      description: book.description,
      language: normalizeLanguage(book.language),
      warnings: book.warnings,
    }
  }

  throw new ImportError('UNSUPPORTED_FORMAT', '仅支持导入 .txt 或 .epub 文件')
}
