import { FlaskConical } from 'lucide-react'
import { useState } from 'react'
import { SimpleCreateDialog } from '@/components/SimpleCreateDialog'
import { useT } from '@/hooks/useT'
import { scienceApi } from '@/lib/api'
import { useProjectName, useScienceEntries } from '@/lib/useProjectData'

const LABEL_MAP: Record<string, { text: string; color: string; bg: string }> = {
  known: { text: '已知', color: 'var(--success)', bg: 'var(--success-soft)' },
  extrapolation: { text: '外推', color: 'var(--warning)', bg: 'var(--warning-soft)' },
  hypothesis: { text: '假设', color: 'var(--error)', bg: 'var(--error-soft)' },
}
const FILTER_OPTIONS = ['全部', 'known', 'extrapolation', 'hypothesis']

export function Science() {
  const { data: entries, loading, reload } = useScienceEntries()
  const [filter, setFilter] = useState(FILTER_OPTIONS[0])
  const [showCreate, setShowCreate] = useState(false)
  const { t } = useT()
  const project = useProjectName()

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">加载中...</div>

  const filtered = filter === '全部' ? entries || [] : (entries || []).filter((e) => e.label === filter)

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5" /> {t('pages.scienceSettings')}
        </h2>
        <div className="page-header-actions">
          <button className="btn-primary" style={{ height: 30, padding: '0 14px' }} onClick={() => setShowCreate(true)}>
            + {t('pages.newSetting')}
          </button>
          <select
            id="science-filter"
            name="science-filter"
            className="setting-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="全部">三色标签: 全部</option>
            <option value="known">🟢 已知科学</option>
            <option value="extrapolation">🟡 外推</option>
            <option value="hypothesis">🔴 假设</option>
          </select>
        </div>
      </div>

      {showCreate && (
        <SimpleCreateDialog
          title={`+ ${t('pages.newSetting')}`}
          fields={[
            {
              key: 'label',
              label: '分类',
              type: 'select',
              required: true,
              options: [
                { value: 'known', label: '🟢 已知科学' },
                { value: 'extrapolation', label: '🟡 外推' },
                { value: 'hypothesis', label: '🔴 假设' },
              ],
            },
            { key: 'name', label: '名称', required: true, placeholder: '设定名称' },
            { key: 'description', label: '描述', type: 'textarea', placeholder: '科学设定的详细说明...' },
          ]}
          onSubmit={async (vals) => {
            await scienceApi.create(project, vals)
            reload()
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      <div className="page-body" style={{ padding: 0 }}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 p-6">
          {filtered.map((entry: any) => {
            const lm = LABEL_MAP[entry.label] || LABEL_MAP.hypothesis
            return (
              <div
                key={entry.id}
                className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-4 cursor-pointer transition-colors hover:border-[var(--hairline-light)] hover:bg-[var(--canvas-elevated)]"
              >
                <span className="text-[10px] px-[6px] py-[1px] rounded-full bg-[var(--canvas-mid)] text-[var(--ink-tertiary)] inline-block mb-1.5">
                  {entry.label === 'known'
                    ? '🟢 已知科学'
                    : entry.label === 'extrapolation'
                      ? '🟡 外推'
                      : '🔴 核心假设'}
                </span>
                <div className="text-[15px] text-[var(--ink)] mb-1">{entry.name}</div>
                <span
                  className="text-[10px] px-[6px] py-[1px] rounded-full mr-1 inline-block"
                  style={{ background: lm.bg, color: lm.color }}
                >
                  {lm.text}
                </span>
                <div className="text-[13px] text-[var(--ink-tertiary)] mt-1">{entry.description}</div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
