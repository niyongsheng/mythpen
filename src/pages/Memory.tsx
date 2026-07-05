import { Brain, Search, Sparkles } from 'lucide-react'
import { useT } from '@/hooks/useT'
import { useMemories } from '@/lib/useProjectData'

const CAT_LABELS = {
  character: '角色',
  location: '地点',
  event: '事件',
  promise: '承诺',
  item: '物品',
  other: '其他',
}
const CAT_COLORS = {
  character: { bg: 'rgba(201,169,110,0.18)', text: 'var(--accent-gold)' },
  location: { bg: 'rgba(122,142,168,0.18)', text: 'var(--accent-mist)' },
  event: { bg: 'var(--info-soft)', text: 'var(--info)' },
  promise: { bg: 'var(--warning-soft)', text: 'var(--warning)' },
  item: { bg: 'var(--success-soft)', text: 'var(--success)' },
}

export function Memory() {
  const { data: memories, loading } = useMemories()
  const { t } = useT()

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">加载中...</div>

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <Brain className="w-5 h-5" /> {t('pages.narrativeMemory')}
        </h2>
        <div className="page-header-actions">
          <button className="btn-secondary flex items-center gap-1.5" style={{ height: 30, padding: '0 14px' }}>
            <Search className="w-3.5 h-3.5" /> {t('pages.semanticSearch')}
          </button>
          <button className="btn-primary flex items-center gap-1.5" style={{ height: 30, padding: '0 14px' }}>
            <Sparkles className="w-3.5 h-3.5" /> {t('pages.aiExtract')}
          </button>
        </div>
      </div>
      <div className="page-body" style={{ padding: 0 }}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 p-6">
          {(memories || []).map((m) => {
            const color = CAT_COLORS[m.category] || { bg: 'var(--canvas-mid)', text: 'var(--ink-tertiary)' }
            return (
              <div
                key={m.id}
                className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-3.5 transition-colors hover:border-[var(--hairline-light)] hover:bg-[var(--canvas-elevated)]"
              >
                <span
                  className="text-[10px] px-[7px] py-[1px] rounded-full inline-block mb-2"
                  style={{ background: color.bg, color: color.text }}
                >
                  {CAT_LABELS[m.category] || m.category}
                </span>
                <div className="text-[13px] text-[var(--ink-secondary)] leading-[1.6]">{m.content}</div>
                <div className="text-[11px] text-[var(--ink-mute)] mt-2 font-mono">
                  {m.source_chapter_id ? `来源: 第${m.source_chapter_id}章` : ''}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
