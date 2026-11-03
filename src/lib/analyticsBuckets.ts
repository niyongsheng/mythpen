// Coarse buckets keep analytics props low-cardinality and avoid sending exact
// project sizes. Shared by project events and the settings-free helpers.

export function bucketCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n <= 10) return '1-10'
  if (n <= 50) return '11-50'
  if (n <= 200) return '51-200'
  if (n <= 1000) return '201-1000'
  if (n <= 5000) return '1001-5000'
  if (n <= 50000) return '5001-50000'
  return '50000+'
}

export function bucketWords(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n < 1000) return '1-999'
  if (n < 10000) return '1k-10k'
  if (n < 50000) return '10k-50k'
  if (n < 200000) return '50k-200k'
  if (n < 500000) return '200k-500k'
  return '500k+'
}

export function ageDays(createdAt?: string | null): number | undefined {
  if (!createdAt) return undefined
  const ts = Date.parse(createdAt)
  if (!Number.isFinite(ts)) return undefined
  return Math.max(0, Math.floor((Date.now() - ts) / 86_400_000))
}
