import { isStandaloneVolumeHeading } from './import/headings'

type Translate = (path: string, params?: Record<string, string | number>) => string

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
  return isStandaloneVolumeHeading(trimmed) ? trimmed : t('sidebar.volumeTitle', { order: sortOrder, title: trimmed })
}
