import { parseEpub } from './epub'
import { MAX_CHAPTERS, MAX_FILE_BYTES, MAX_TEXT_CHARS } from './limits'
import { parseTxt } from './txt'
import type { ParsedBook, TextEncoding } from './types'
import { ImportError } from './types'

export interface ParseImportOptions {
  encoding?: TextEncoding
}

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index === -1 ? '' : fileName.slice(index + 1).toLowerCase()
}

/** Parse a TXT/EPUB file selected by the user. Throws ImportError on failure. */
export async function parseImportFile(file: File, options: ParseImportOptions = {}): Promise<ParsedBook> {
  if (file.size > MAX_FILE_BYTES) {
    throw new ImportError('FILE_TOO_LARGE', `文件超过 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB 上限`)
  }

  const extension = extensionOf(file.name)
  let book: ParsedBook

  if (extension === 'txt') {
    book = parseTxt(await file.arrayBuffer(), file.name, { encoding: options.encoding })
  } else if (extension === 'epub') {
    book = await parseEpub(file)
  } else {
    throw new ImportError('UNSUPPORTED_FORMAT', '仅支持导入 .txt 或 .epub 文件')
  }

  if (book.totalChapters > MAX_CHAPTERS) {
    throw new ImportError('TOO_MANY_CHAPTERS', `章节数超过上限（${MAX_CHAPTERS} 章）`)
  }
  if (book.totalWords > MAX_TEXT_CHARS) {
    throw new ImportError('FILE_TOO_LARGE', '正文内容过大，请拆分后分项目导入')
  }
  if (book.totalChapters === 0) {
    throw new ImportError('EMPTY_BOOK', '未检测到可导入的正文')
  }

  book.fileName = file.name
  return book
}
