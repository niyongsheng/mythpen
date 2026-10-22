import { Dropdown } from '@/components/Dropdown'
import { useT } from '@/hooks/useT'

interface SessionLike {
  id: string
  title: string
}

interface SessionSelectProps {
  sessions: SessionLike[]
  currentSessionId: string | null
  onSelect: (sessionId: string) => void
}

/** Compact AI-session picker for the assistant panel header. */
export function SessionSelect({ sessions, currentSessionId, onSelect }: SessionSelectProps) {
  const { t } = useT()
  return (
    <Dropdown
      value={currentSessionId}
      options={sessions.map((session) => ({ value: session.id, label: session.title }))}
      onChange={onSelect}
      ariaLabel={t('ai.switchSession')}
      placeholder={t('ai.noSession')}
      size="sm"
      className="flex-1 min-w-0"
      menuClassName="max-h-[280px]"
    />
  )
}
