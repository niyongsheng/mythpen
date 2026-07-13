import { BookOpen, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { ProjectIcon } from '@/components/ProjectIcon'
import { useT } from '@/hooks/useT'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUIStore } from '@/stores/useUIStore'

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return dateStr
  }
}

export function ProjectList() {
  const { projects, setCurrentProject, showProjectList, deleteProject } = useProjectStore()
  const { setProjectDialogOpen } = useUIStore()
  const { t } = useT()
  const totalWords = projects.reduce((s, p) => s + p.wordCount, 0)

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  if (!showProjectList) return null

  const handleDelete = async () => {
    if (!deleteTarget) return
    const name = deleteTarget
    setDeleteTarget(null)
    await deleteProject(name)
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-16 py-12 flex justify-center custom-scrollbar">
        <div className="w-full max-w-[800px]">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-display text-[36px] font-semibold leading-[1.2]">{t('project.list')}</h1>
              <div className="text-[var(--ink-tertiary)] text-[13px] mt-1">
                {t('project.total', { count: projects.length, words: totalWords.toLocaleString() })}
              </div>
            </div>
            <button className="btn-primary h-[34px] px-5" onClick={() => setProjectDialogOpen(true)}>
              + {t('project.new')}
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 mb-6 rounded-2xl bg-[var(--canvas-card)] border border-[var(--hairline)] flex items-center justify-center text-[32px] text-[var(--ink-tertiary)]">
                <BookOpen size={32} />
              </div>
              <h2 className="font-display text-[22px] font-semibold text-[var(--ink)] mb-2">
                {t('project.noProjectsTitle')}
              </h2>
              <p className="text-[var(--ink-tertiary)] text-[14px] max-w-[320px] leading-relaxed">
                {t('project.noProjectsDesc')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="group relative bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-5 cursor-pointer transition-all hover:border-[var(--hairline-light)] hover:bg-[var(--canvas-elevated)] hover:-translate-y-px"
                  onClick={() => setCurrentProject(p.name)}
                >
                  {/* Delete button — visible on hover */}
                  <button
                    className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-[var(--canvas-mid)] text-[var(--ink-tertiary)] hover:text-red-500 transition-all"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTarget(p.name)
                    }}
                    title={t('project.deleteTooltip')}
                  >
                    <Trash2 size={14} />
                  </button>

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
                    <span>
                      {p.wordCount.toLocaleString()} {t('editor.words')}
                    </span>
                    <span>
                      {p.chapterCount} {t('project.chapterUnit')}
                    </span>
                    <span>{t('project.updatedAt', { date: formatDate(p.lastOpened) })}</span>
                  </div>
                  <div className="text-[11px] text-[var(--ink-mute)]">
                    {t(`project.mode.${p.mode}`)} · {t(`status.${p.status}`)}
                  </div>
                </div>
              ))}

              {/* New project card */}
              <div
                className="border border-dashed border-[var(--hairline-light)] rounded-lg flex items-center justify-center min-h-[160px] text-[var(--ink-tertiary)] text-[13px] gap-1.5 flex-col cursor-pointer hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)] hover:bg-[var(--canvas-card)] transition-colors"
                onClick={() => setProjectDialogOpen(true)}
              >
                <span className="text-[28px] leading-none">+</span>
                <span>{t('project.new')}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-xl w-[400px] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold text-[var(--ink)]">{t('project.deleteTooltip')}</h2>
              <button
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--canvas-mid)] text-[var(--ink-tertiary)]"
                onClick={() => setDeleteTarget(null)}
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-[var(--ink-secondary)] text-[14px] leading-relaxed mb-6">
              {t('project.confirmDeleteMsg', { name: deleteTarget })}
              <br />
              {t('project.permanentDelete')}
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary h-[34px] px-4" onClick={() => setDeleteTarget(null)}>
                {t('project.cancel')}
              </button>
              <button
                className="btn-primary h-[34px] px-4 !bg-red-600 !border-red-600 hover:!bg-red-700"
                onClick={handleDelete}
              >
                {t('project.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
