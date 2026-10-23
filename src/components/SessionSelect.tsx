import { Dropdown } from '@/components/Dropdown'
import { useT } from '@/hooks/useT'

interface SessionLike {
  id: string
  title: string
  created_at?: string
  updated_at?: string
}

interface SessionSelectProps {
  sessions: SessionLike[]
  currentSessionId: string | null
  onSelect: (sessionId: string) => void
}

/** SQLite stores `datetime('now')` as UTC without a timezone suffix. */
function parseDbTime(value?: string): Date | null {
  if (!value) return null
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Keep the session's creation time visible even after the AI renames it. */
function formatSessionTime(session: SessionLike): string {
  const date = parseDbTime(session.created_at || session.updated_at)
  if (!date) return ''

  const locale = document.documentElement.lang || undefined
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  const sameYear = date.getFullYear() === now.getFullYear()
  const day = date.toLocaleDateString(
    locale,
    sameYear ? { month: '2-digit', day: '2-digit' } : { year: 'numeric', month: '2-digit', day: '2-digit' },
  )

  // Auto-generated titles already contain the time ("New Session 15:16");
  // don't print it twice. Older sessions still get a date.
  const titleHasTime = session.title.includes(time)
  if (sameDay) return titleHasTime ? '' : time
  return titleHasTime ? day : `${day} ${time}`
}

/** Compact AI-session picker for the assistant panel header. */
export function SessionSelect({ sessions, currentSessionId, onSelect }: SessionSelectProps) {
  const { t } = useT()
  return (
    <Dropdown
      value={currentSessionId}
      options={sessions.map((session) => ({
        value: session.id,
        label: session.title,
        meta: formatSessionTime(session),
      }))}
      onChange={onSelect}
      ariaLabel={t('ai.switchSession')}
      placeholder={t('ai.noSession')}
      size="sm"
      className="flex-1 min-w-0"
      menuClassName="max-h-[280px]"
      renderTriggerMeta={(selected) => {
        const session = sessions.find((item) => item.id === selected?.value)
        const time = session ? formatSessionTime(session) : ''
        return time ? <span className="shrink-0 font-mono text-[10px] text-[var(--ink-mute)]">{time}</span> : null
      }}
    />
  )
}
