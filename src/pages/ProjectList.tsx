import { ProjectIcon } from '@/components/ProjectIcon'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUIStore } from '@/stores/useUIStore'

export function ProjectList() {
  const { projects, setCurrentProject, showProjectList } = useProjectStore()
  const { setProjectDialogOpen } = useUIStore()
  const totalWords = projects.reduce((s, p) => s + p.wordCount, 0)

  if (!showProjectList) return null

  return (
    <div className="flex-1 overflow-y-auto px-16 py-12 flex justify-center">
      <div className="w-full max-w-[800px]">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-[36px] font-semibold leading-[1.2]">我的项目</h1>
            <div className="text-[var(--ink-tertiary)] text-[13px] mt-1">
              共 {projects.length} 个项目 · 总计 {totalWords.toLocaleString()} 字
            </div>
          </div>
          <button className="btn-primary h-[34px] px-5" onClick={() => setProjectDialogOpen(true)}>
            + 新建项目
          </button>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-5 cursor-pointer transition-all hover:border-[var(--hairline-light)] hover:bg-[var(--canvas-elevated)] hover:-translate-y-px"
              onClick={() => setCurrentProject(p.name)}
            >
              <div className="mb-2.5">
                <ProjectIcon name={p.iconName} className="w-7 h-7" />
              </div>
              <div className="font-display text-lg font-medium text-[var(--ink)] mb-1">{p.name}</div>
              <div className="flex gap-1 flex-wrap mb-2.5">
                {p.genres.map((g) => (
                  <span
                    key={g}
                    className="text-[10px] px-[6px] py-[1px] rounded-full bg-[var(--canvas-mid)] text-[var(--ink-tertiary)]"
                  >
                    {g}
                  </span>
                ))}
              </div>
              <div className="flex gap-3 mb-2 pt-2 border-t border-[var(--hairline)] text-[11px] text-[var(--ink-tertiary)]">
                <span>{p.wordCount.toLocaleString()} 字</span>
                <span>{p.chapterCount} 章</span>
                <span>更新于 {p.lastOpened}</span>
              </div>
              <div className="text-[11px] text-[var(--ink-mute)]">
                {p.mode === 'long-novel' ? '长篇' : p.mode === 'medium-novel' ? '中篇' : '短篇'} · {p.status}
              </div>
            </div>
          ))}

          {/* New project card */}
          <div
            className="border border-dashed border-[var(--hairline-light)] rounded-lg flex items-center justify-center min-h-[160px] text-[var(--ink-tertiary)] text-[13px] gap-1.5 flex-col cursor-pointer hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)] hover:bg-[var(--canvas-card)] transition-colors"
            onClick={() => setProjectDialogOpen(true)}
          >
            <span className="text-[28px] leading-none">+</span>
            <span>新建项目</span>
          </div>
        </div>
      </div>
    </div>
  )
}
