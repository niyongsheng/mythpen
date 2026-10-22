import type { ImportWarning, TextEncoding } from './types'

const COMMON_CHARS = '的一了是我不在人有他这为之大来以个中上们到说国和地也子时道出而要于就下得可你年生'
const REPLACEMENT = '�'

export interface DecodeResult {
  text: string
  encoding: string
  warnings: ImportWarning[]
}

function tryDecode(bytes: Uint8Array, label: string, fatal = false): string | null {
  try {
    return new TextDecoder(label, { fatal }).decode(bytes)
  } catch {
    return null
  }
}

function hasBom(bytes: Uint8Array, ...prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value)
}

function looksUtf16(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const sample = bytes.subarray(0, Math.min(bytes.length, 2048))
  let evenZeros = 0
  let oddZeros = 0
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] !== 0) continue
    if (i % 2 === 0) evenZeros += 1
    else oddZeros += 1
  }
  const total = Math.max(1, sample.length)
  if (oddZeros / total > 0.25 && evenZeros / total < 0.05) return 'utf-16le'
  if (evenZeros / total > 0.25 && oddZeros / total < 0.05) return 'utf-16be'
  return null
}

function scoreText(text: string): number {
  let score = 0
  for (const char of text) {
    if (char === REPLACEMENT) score -= 5
    else if (COMMON_CHARS.includes(char)) score += 2
  }
  return score
}

function normalizeLabel(encoding: TextEncoding): string | null {
  switch (encoding) {
    case 'utf-8':
      return 'utf-8'
    case 'gb18030':
    case 'gbk':
      return 'gb18030'
    case 'big5':
      return 'big5'
    case 'utf-16le':
      return 'utf-16le'
    case 'utf-16be':
      return 'utf-16be'
    default:
      return null
  }
}

/**
 * Decode a text file buffer. Detection order: BOM → strict UTF-8 → GB18030 /
 * Big5 heuristics → UTF-8 with replacement characters as a last resort.
 */
export function decodeTextBuffer(buffer: ArrayBuffer, encoding: TextEncoding = 'auto'): DecodeResult {
  const bytes = new Uint8Array(buffer)
  const warnings: ImportWarning[] = []

  if (encoding !== 'auto') {
    const label = normalizeLabel(encoding)
    if (label) {
      const text = tryDecode(bytes, label)
      if (text != null) return { text, encoding: label, warnings }
    }
    warnings.push({ code: 'unknownEncoding' })
  }

  if (hasBom(bytes, 0xef, 0xbb, 0xbf)) {
    const text = new TextDecoder('utf-8').decode(bytes.subarray(3))
    return { text, encoding: 'utf-8', warnings }
  }
  if (hasBom(bytes, 0xff, 0xfe)) {
    const text = tryDecode(bytes.subarray(2), 'utf-16le')
    if (text != null) return { text, encoding: 'utf-16le', warnings }
  }
  if (hasBom(bytes, 0xfe, 0xff)) {
    const text = tryDecode(bytes.subarray(2), 'utf-16be')
    if (text != null) return { text, encoding: 'utf-16be', warnings }
  }

  const utf16 = looksUtf16(bytes)
  if (utf16) {
    const text = tryDecode(bytes, utf16)
    if (text != null) return { text, encoding: utf16, warnings }
  }

  const strictUtf8 = tryDecode(bytes, 'utf-8', true)
  if (strictUtf8 != null) return { text: strictUtf8, encoding: 'utf-8', warnings }

  const gb = tryDecode(bytes, 'gb18030')
  const big5 = tryDecode(bytes, 'big5')
  if (gb == null && big5 == null) {
    return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8', warnings }
  }
  if (gb != null && big5 != null) {
    const gbScore = scoreText(gb)
    const big5Score = scoreText(big5)
    if (big5Score > gbScore + 20) {
      return { text: big5, encoding: 'big5', warnings: [...warnings, { code: 'encodingFallback', value: 2 }] }
    }
    return { text: gb, encoding: 'gb18030', warnings: [...warnings, { code: 'encodingFallback', value: 1 }] }
  }
  const text = gb ?? big5 ?? ''
  return {
    text,
    encoding: gb != null ? 'gb18030' : 'big5',
    warnings: [...warnings, { code: 'encodingFallback', value: gb != null ? 1 : 2 }],
  }
}
