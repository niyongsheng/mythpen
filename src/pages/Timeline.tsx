import { CalendarDays, Plus } from 'lucide-react'
import { useState } from 'react'
import { SimpleCreateDialog } from '@/components/SimpleCreateDialog'
import { useT } from '@/hooks/useT'
import { useDataRefresh } from '@/hooks/useDataRefresh'
import { timelineApi } from '@/lib/api'
import { useProjectName, useTimelineEvents } from '@/lib/useProjectData'

export function Timeline() {
  const { data: events, loading, reload } = useTimelineEvents()
  useDataRefresh('timeline', reload)
  const { t } = useT()
  const project = useProjectName()
  const [showCreate, setShowCreate] = useState(false)

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">加载中...</div>

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5" /> {t('pages.timeline')}
        </h2>
        <div className="page-header-actions">
          <button
            className="btn-primary flex items-center gap-1"
            style={{ height: 30, padding: '0 14px' }}
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-3.5 h-3.5" /> {t('pages.newEvent')}
          </button>
        </div>
      </div>

      {showCreate && (
        <SimpleCreateDialog
          title={`+ ${t('pages.newEvent')}`}
          fields={[
            { key: 'year', label: '年份', required: true, placeholder: '例如: 2036' },
            { key: 'title', label: '事件标题', required: true, placeholder: '事件的名称' },
            { key: 'description', label: '描述', type: 'textarea', placeholder: '事件的详细描述...' },
            { key: 'importance', label: '重要性 (1-5)', type: 'number', placeholder: '3' },
          ]}
          onSubmit={async (vals) => {
            await timelineApi.create(project, {
              year: vals.year,
              title: vals.title,
              description: vals.description,
              importance: parseInt(vals.importance) || 3,
            })
            reload()
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      <div className="page-body" style={{ padding: 0 }}>
        <div className="relative px-8 pb-8 pt-6 max-w-[820px]">
          <div className="absolute left-12 top-6 bottom-0 w-[2px] bg-[var(--hairline-light)]" />
          {(events || []).map((ev, i) => (
            <div key={ev.id} className="flex gap-[18px] pb-[18px] relative">
              <div
                className={`w-3 h-3 rounded-full shrink-0 z-[1] mt-1 ml-[30px]
                ${ev.importance < 3 ? 'bg-[var(--canvas-pop)] shadow-none' : 'bg-[var(--accent-gold)] border-2 border-[var(--canvas)] shadow-[0_0_0_2px_var(--accent-gold-soft-bg)]'}`}
              />
              <div className="font-display text-lg text-[var(--accent-gold)] w-[90px] shrink-0 text-right">
                {ev.year}
              </div>
              <div className="flex-1">
                <div className="text-[15px] text-[var(--ink)] mb-1">
                  {ev.title}
                  <span className="inline-flex gap-[1px] ml-2 align-middle">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className="w-2 h-2 rounded-full"
                        style={{ background: star <= ev.importance ? 'var(--accent-gold)' : 'var(--canvas-mid)' }}
                      />
                    ))}
                  </span>
                </div>
                <div className="text-[13px] text-[var(--ink-tertiary)] leading-[1.6]">{ev.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
