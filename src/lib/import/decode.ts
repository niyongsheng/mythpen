import type { ImportWarning, TextEncoding } from './types'

const COMMON_CHARS = '的一了是我不在人有他这为之大来以个中上们到说国和地也子时道出而要于就下得可你年生'
const REPLACEMENT = '�'

export interface DecodeResult {
  text: string
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
      if (text != null) return { text, warnings }
    }
    warnings.push({ code: 'unknownEncoding' })
  }

  if (hasBom(bytes, 0xef, 0xbb, 0xbf)) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), warnings }
  }
  if (hasBom(bytes, 0xff, 0xfe)) {
    const text = tryDecode(bytes.subarray(2), 'utf-16le')
    if (text != null) return { text, warnings }
  }
  if (hasBom(bytes, 0xfe, 0xff)) {
    const text = tryDecode(bytes.subarray(2), 'utf-16be')
    if (text != null) return { text, warnings }
  }

  const utf16 = looksUtf16(bytes)
  if (utf16) {
    const text = tryDecode(bytes, utf16)
    if (text != null) return { text, warnings }
  }

  const strictUtf8 = tryDecode(bytes, 'utf-8', true)
  if (strictUtf8 != null) return { text: strictUtf8, warnings }

  // Score a sample first: decoding a multi-megabyte novel twice just to pick
  // between GB18030 and Big5 blocks the main thread for seconds.
  const SAMPLE_BYTES = 256 * 1024
  const sample = bytes.subarray(0, Math.min(bytes.length, SAMPLE_BYTES))
  const gbSample = tryDecode(sample, 'gb18030')
  const big5Sample = tryDecode(sample, 'big5')
  if (gbSample == null && big5Sample == null) {
    return { text: new TextDecoder('utf-8').decode(bytes), warnings }
  }

  const preferBig5 = gbSample != null && big5Sample != null && scoreText(big5Sample) > scoreText(gbSample) + 20
  const fallback = preferBig5 || gbSample == null ? 'big5' : 'gb18030'
  return {
    text: tryDecode(bytes, fallback) ?? new TextDecoder('utf-8').decode(bytes),
    warnings: [...warnings, { code: 'encodingFallback', value: fallback === 'big5' ? 2 : 1 }],
  }
}
