type Translate = (path: string, params?: Record<string, string | number>) => string

/** Titles that already carry a volume label, e.g. "第一卷 · 完美样本". */
const VOLUME_LABEL_RE =
  /^(第\s*[\d零〇一二三四五六七八九十百千万两]+\s*[卷部集]|卷\s*[\d零〇一二三四五六七八九十百千万两]+|(volume|book|part)\s+([0-9]+|[ivxlcdm]+)\b|上卷|中卷|下卷|上部|中部|下部)/i

/**
 * Formats a volume heading without duplicating its numeric label.
 *
 * AI-generated volumes often arrive titled "第一卷 · 完美样本"; those already
 * carry the label, so render them verbatim. Plain titles such as "完美样本"
 * still get the "第N卷 · " prefix.
 */
export function formatVolumeTitle(title: string, sortOrder: number, t: Translate): string {
  const trimmed = (title || '').trim()
  if (!trimmed) return t('sidebar.volumeTitle', { order: sortOrder, title: '' }).trim()
  if (VOLUME_LABEL_RE.test(trimmed)) return trimmed
  return t('sidebar.volumeTitle', { order: sortOrder, title: trimmed })
}
