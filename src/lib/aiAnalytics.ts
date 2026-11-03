import { useSettingsStore } from '@/stores/useSettingsStore'

/** Provider/model labels for analytics. Never includes keys or base URLs. */
export function aiRuntimeProps(): { provider: string; model: string } {
  const s = useSettingsStore.getState().settings
  return {
    provider: s.apiType === 'claude' ? 'anthropic' : 'openai',
    model: s.apiModel || 'unknown',
  }
}

const shortString = (value: unknown, max = 48): string | undefined => {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text ? text.slice(0, max) : undefined
}

/** Keep only a short, non-sensitive code/type from an error. */
export function aiErrorCode(err: unknown): string {
  const outer = (err ?? {}) as Record<string, unknown>
  const inner = (
    typeof outer.error === 'object' && outer.error ? (outer.error as Record<string, unknown>) : {}
  ) as Record<string, unknown>
  const raw =
    shortString(outer.code) ??
    shortString(inner.code) ??
    shortString(outer.type) ??
    shortString(inner.type) ??
    shortString(outer.name)
  if (raw && raw !== 'Error') return raw
  return outer.error ? 'provider_error' : 'unknown'
}

/** Comma-separated names of the tools a run touched (max 8). */
export function aiToolNames(toolCalls: { name?: unknown }[] | undefined): string | undefined {
  if (!toolCalls?.length) return undefined
  const names = [...new Set(toolCalls.map((tc) => (typeof tc?.name === 'string' ? tc.name : undefined)))]
  return (
    names
      .filter((n): n is string => Boolean(n))
      .slice(0, 8)
      .join(',') || undefined
  )
}
