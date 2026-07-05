import { useT } from '@/hooks/useT'
import { useChapterStore } from '@/stores/useChapterStore'

export function EditorStatusbar() {
  const currentChapter = useChapterStore((s) => s.currentChapter)
  const saveStatus = useChapterStore((s) => s.saveStatus)
  const { t } = useT()

  if (!currentChapter) {
    return (
      <div className="h-[var(--statusbar-h)] bg-[var(--canvas-soft)] border-t border-[var(--hairline)] flex items-center px-4 font-mono text-[12px] text-[var(--ink-tertiary)] shrink-0">
        <span>{t('editor.noChapter')}</span>
      </div>
    )
  }

  return (
    <div className="h-[var(--statusbar-h)] bg-[var(--canvas-soft)] border-t border-[var(--hairline)] flex items-center px-4 gap-4 font-mono text-[12px] text-[var(--ink-tertiary)] shrink-0">
      <span>
        第{currentChapter.num}章 · {currentChapter.title}
      </span>
      <span>
        {(currentChapter.wordCount || 0).toLocaleString()} {t('editor.words')}
      </span>
      <span>{t(`status.${currentChapter.status}`)}</span>
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
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px]">
        <span className="w-2 h-2 rounded-full bg-[var(--accent-gold)] animate-pulse inline-block" />
        保存中...
      </span>
    )
  }
  if (status === 'unsaved') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-mute)]">
        <span className="w-2 h-2 rounded-full bg-[var(--ink-mute)] inline-block" />
        未保存
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-tertiary)]">
      <span
        className="w-2 h-2 rounded-full bg-[var(--success)] inline-block"
        style={{ boxShadow: '0 0 0 2px rgba(76,175,125,0.2)' }}
      />
      已保存
    </span>
  )
}
