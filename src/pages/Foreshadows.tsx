import type { LucideIcon } from 'lucide-react'
import { CheckCircle2, Link2, Pin, Plus, RefreshCw, Target } from 'lucide-react'
import { useState } from 'react'
import { SimpleCreateDialog } from '@/components/SimpleCreateDialog'
import { useT } from '@/hooks/useT'
import { foreshadowsApi } from '@/lib/api'
import { useForeshadows, useProjectName } from '@/lib/useProjectData'

interface Column {
  key: string
  icon: LucideIcon
  label: string
}

const COLUMNS: Column[] = [
  { key: 'planted', icon: Pin, label: '已埋' },
  { key: 'progressing', icon: RefreshCw, label: '进展中' },
  { key: 'resolved', icon: CheckCircle2, label: '已回收' },
]

export function Foreshadows() {
  const { data: foreshadows, loading, reload } = useForeshadows()
  const { t } = useT()
  const project = useProjectName()
  const [showCreate, setShowCreate] = useState(false)

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">加载中...</div>

  const list = foreshadows || []
  const stats = [
    { label: '总计', value: String(list.length), color: 'var(--accent-gold)' },
    { label: '已埋', value: String(list.filter((f) => f.status === 'planted').length) },
    { label: '进展中', value: String(list.filter((f) => f.status === 'progressing').length) },
    { label: '已回收', value: String(list.filter((f) => f.status === 'resolved').length) },
    {
      label: '逾期',
      value: String(list.filter((f: any) => f.status === 'planted' && f.expected_resolve_chapter).length),
      color: 'var(--error)',
    },
  ]

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <Link2 className="w-5 h-5" /> {t('pages.foreshadowBoard')}
        </h2>
        <div className="page-header-actions">
          <button className="btn-primary flex items-center gap-1.5" style={{ height: 30, padding: '0 14px' }}>
            <Target className="w-3.5 h-3.5" /> {t('pages.aiDesign')}
          </button>
          <button
            className="btn-secondary flex items-center gap-1"
            style={{ height: 30, padding: '0 14px' }}
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-3.5 h-3.5" /> {t('pages.manualAdd')}
          </button>
        </div>
      </div>

      {showCreate && (
        <SimpleCreateDialog
          title={`+ ${t('pages.manualAdd')}`}
          fields={[
            { key: 'title', label: '伏笔标题', required: true, placeholder: '伏笔的名称' },
            { key: 'description', label: '描述', type: 'textarea', placeholder: '伏笔的详细描述...' },
            {
              key: 'priority',
              label: '优先级',
              type: 'select',
              options: [
                { value: 'high', label: '高' },
                { value: 'normal', label: '普通' },
                { value: 'low', label: '低' },
              ],
            },
            {
              key: 'status',
              label: '状态',
              type: 'select',
              options: [
                { value: 'planted', label: '已埋' },
                { value: 'progressing', label: '进展中' },
              ],
            },
          ]}
          onSubmit={async (vals) => {
            await foreshadowsApi.create(project, vals)
            reload()
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      <div className="flex gap-3 px-6 py-4 shrink-0 bg-[var(--canvas-soft)] border-b border-[var(--hairline)]">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg px-5 py-3 min-w-[100px] text-center"
          >
            <div className="font-mono text-lg" style={{ color: s.color || 'var(--accent-gold)' }}>
              {s.value}
            </div>
            <div className="text-[11px] text-[var(--ink-tertiary)] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-4 flex-1 px-6 py-4 overflow-x-auto min-h-0">
        {COLUMNS.map((col) => {
          const ColIcon = col.icon
          return (
            <div key={col.key} className="flex-1 min-w-[240px] bg-[var(--canvas-soft)] rounded-lg flex flex-col">
              <div className="px-3.5 py-2.5 text-[13px] font-medium text-[var(--ink-secondary)] border-b border-[var(--hairline)] flex items-center justify-between gap-1.5">
                <span className="flex items-center gap-1">
                  <ColIcon className="w-3.5 h-3.5" /> {col.label}
                </span>
                <span>{list.filter((f: any) => f.status === col.key).length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {list
                  .filter((f: any) => f.status === col.key)
                  .map((f: any) => (
                    <div
                      key={f.id}
                      className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-[var(--radius-sm)] p-2.5 mb-1.5 cursor-pointer transition-colors hover:border-[var(--hairline-light)]"
                    >
                      <div className="text-[13px] text-[var(--ink)] flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 inline-block
                        ${f.priority === 'high' ? 'bg-[var(--error)]' : f.priority === 'normal' ? 'bg-[var(--accent-gold)]' : 'bg-[var(--ink-mute)]'}`}
                        />
                        {f.title}
                      </div>
                      {f.description && (
                        <div className="text-[12px] text-[var(--ink-tertiary)] mt-1 line-clamp-2">{f.description}</div>
                      )}
                      {f.expected_resolve_chapter > 0 && (
                        <div className="text-[10px] text-[var(--ink-mute)] mt-1 font-mono">
                          预期回收: 第{f.expected_resolve_chapter}章
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
