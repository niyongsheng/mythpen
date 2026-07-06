import { Building2, Calendar, Cog, Globe, Lightbulb, MapPin } from 'lucide-react'
import { useState } from 'react'
import { SimpleCreateDialog } from '@/components/SimpleCreateDialog'
import { useDataRefresh } from '@/hooks/useDataRefresh'
import { useT } from '@/hooks/useT'
import { worldApi } from '@/lib/api'
import { useProjectName, useWorldEntries } from '@/lib/useProjectData'

const TABS = ['全部', 'location', 'organization', 'concept', 'event']
const TAB_LABELS: Record<string, string> = {
  全部: '全部',
  location: '地点',
  organization: '组织',
  concept: '概念',
  event: '事件',
}
const TAB_ICONS: Record<string, React.ReactNode> = {
  全部: null,
  location: <MapPin className="w-3.5 h-3.5" />,
  organization: <Building2 className="w-3.5 h-3.5" />,
  concept: <Lightbulb className="w-3.5 h-3.5" />,
  event: <Calendar className="w-3.5 h-3.5" />,
}
const CAT_LABELS: Record<string, string> = {
  location: '地点',
  organization: '组织',
  concept: '概念',
  event: '事件',
  technology: '科技',
}
const CAT_ICONS: Record<string, React.ReactNode> = {
  location: <MapPin className="w-3.5 h-3.5" />,
  organization: <Building2 className="w-3.5 h-3.5" />,
  concept: <Lightbulb className="w-3.5 h-3.5" />,
  event: <Calendar className="w-3.5 h-3.5" />,
  technology: <Cog className="w-3.5 h-3.5" />,
}

export function World() {
  const { data: entries, loading, reload } = useWorldEntries()
  useDataRefresh('world', reload)
  const [activeTab, setActiveTab] = useState('全部')
  const [showCreate, setShowCreate] = useState(false)
  const { t } = useT()
  const project = useProjectName()

  const filtered = activeTab === '全部' ? entries || [] : (entries || []).filter((e) => e.category === activeTab)

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">加载中...</div>

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <Globe className="w-5 h-5" /> {t('pages.world')}
        </h2>
        <div className="page-header-actions">
          <button className="btn-primary" style={{ height: 30, padding: '0 14px' }} onClick={() => setShowCreate(true)}>
            + {t('pages.newEntry')}
          </button>
        </div>
      </div>

      {showCreate && (
        <SimpleCreateDialog
          title={`+ ${t('pages.newEntry')}`}
          fields={[
            {
              key: 'category',
              label: '分类',
              type: 'select',
              required: true,
              options: [
                { value: 'location', label: '地点' },
                { value: 'organization', label: '组织' },
                { value: 'concept', label: '概念' },
                { value: 'event', label: '事件' },
              ],
            },
            { key: 'name', label: '名称', required: true, placeholder: '条目标题' },
            { key: 'description', label: '描述', type: 'textarea', placeholder: '详细描述...' },
          ]}
          onSubmit={async (vals) => {
            await worldApi.create(project, vals)
            reload()
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      <div className="flex gap-0 border-b border-[var(--hairline)] px-6 shrink-0 bg-[var(--canvas-soft)]">
        {TABS.map((t) => (
          <span
            key={t}
            className={`px-4 py-2.5 text-[13px] cursor-pointer border-b-2 transition-colors
              ${activeTab === t ? 'text-[var(--ink)] border-b-2 border-[var(--accent-gold)]' : 'text-[var(--ink-tertiary)] border-b-2 border-transparent hover:text-[var(--ink-secondary)]'}`}
            onClick={() => setActiveTab(t)}
          >
            <span className="flex items-center gap-1">
              {TAB_ICONS[t]} {TAB_LABELS[t] || t}
            </span>
          </span>
        ))}
      </div>
      <div className="page-body" style={{ padding: 0 }}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 p-6">
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-4 cursor-pointer transition-colors hover:border-[var(--hairline-light)] hover:bg-[var(--canvas-elevated)]"
            >
              <span className="text-[10px] px-[6px] py-[1px] rounded-full bg-[var(--canvas-mid)] text-[var(--ink-tertiary)] inline-block mb-1.5">
                <span className="inline-flex items-center gap-0.5">
                  {CAT_ICONS[entry.category]} {CAT_LABELS[entry.category] || entry.category}
                </span>
              </span>
              <div className="text-[15px] text-[var(--ink)] mb-1">{entry.name}</div>
              <div className="text-[13px] text-[var(--ink-tertiary)] line-clamp-2">{entry.description}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
