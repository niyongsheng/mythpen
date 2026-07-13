import { useT } from '@/hooks/useT'
import { NEXT_STATUS } from '@/lib/status'
import { useProjectName } from '@/lib/useProjectData'
import { useChapterStore } from '@/stores/useChapterStore'

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--pending)',
  writing: 'var(--info)',
  review: 'var(--warning)',
  accepted: 'var(--success)',
}

export function EditorStatusbar() {
  const currentChapter = useChapterStore((s) => s.currentChapter)
  const saveStatus = useChapterStore((s) => s.saveStatus)
  const updateChapter = useChapterStore((s) => s.updateChapter)
  const loadChapters = useChapterStore((s) => s.loadChapters)
  const project = useProjectName()
  const { t } = useT()

  const handleCycleStatus = () => {
    if (!currentChapter || !project) return
    const next = NEXT_STATUS[currentChapter.status] || 'writing'
    updateChapter(project, currentChapter.num, { status: next }).catch(() => {})
    loadChapters(project).catch(() => {})
  }

  if (!currentChapter) {
    return (
      <div className="h-[var(--statusbar-h)] bg-[var(--canvas-soft)] border-t border-[var(--hairline)] flex items-center px-4 font-mono text-[12px] text-[var(--ink-tertiary)] shrink-0">
        <span>{t('editor.noChapter')}</span>
      </div>
    )
  }

  return (
    <div className="h-[var(--statusbar-h)] bg-[var(--canvas-soft)] border-t border-[var(--hairline)] flex items-center px-4 gap-4 font-mono text-[12px] text-[var(--ink-tertiary)] shrink-0">
      <span>{t('sidebar.chapterTitle', { num: currentChapter.num, title: currentChapter.title })}</span>
      <span>
        {(currentChapter.wordCount || 0).toLocaleString()} {t('editor.words')}
      </span>
      <button
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-sm)] border-none bg-none cursor-pointer hover:bg-[var(--canvas-card)] transition-colors font-mono text-[12px]"
        style={{ color: STATUS_COLORS[currentChapter.status] || 'var(--ink-tertiary)' }}
        onClick={handleCycleStatus}
        title={t('editor.switchTo', { status: t('status.' + (NEXT_STATUS[currentChapter.status] || 'writing')) })}
      >
        {t(`status.${currentChapter.status}`)}
        <span className="text-[10px] opacity-60">↻</span>
      </button>
      <span>·</span>
      <span>L1 C1</span>
      <div className="ml-auto flex items-center gap-3">
        <SaveIndicator status={saveStatus} />
        <span>
          {t('editor.lastSaved')}: {t('editor.justNow')}
        </span>
      </div>
    </div>
  )
}

function SaveIndicator({ status }: { status: 'saved' | 'saving' | 'unsaved' }) {
  const { t } = useT()
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px]">
        <span className="w-2 h-2 rounded-full bg-[var(--accent-gold)] animate-pulse inline-block" />
        {t('editor.saving')}
      </span>
    )
  }
  if (status === 'unsaved') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-mute)]">
        <span className="w-2 h-2 rounded-full bg-[var(--ink-mute)] inline-block" />
        {t('editor.notSaved')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-tertiary)]">
      <span
        className="w-2 h-2 rounded-full bg-[var(--success)] inline-block"
        style={{ boxShadow: '0 0 0 2px rgba(76,175,125,0.2)' }}
      />
      {t('editor.saved')}
    </span>
  )
}
