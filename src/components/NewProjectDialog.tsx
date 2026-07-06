import { useEffect, useState } from 'react'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUIStore } from '@/stores/useUIStore'

const GENRES = [
  { key: 'sci-fi', icon: '🎭', label: '科幻' },
  { key: 'fantasy', icon: '🧙', label: '玄幻' },
  { key: 'romance', icon: '💕', label: '言情' },
  { key: 'history', icon: '🏛️', label: '历史' },
  { key: 'urban', icon: '🌆', label: '都市' },
  { key: 'power-fantasy', icon: '⚡', label: '爽文' },
  { key: 'biography', icon: '📖', label: '传记' },
  { key: 'other', icon: '📜', label: '其他' },
]

const MODES = [
  { key: 'short-story', label: '短篇（≤3万字）' },
  { key: 'medium-novel', label: '中篇（5-10万字）' },
  { key: 'long-novel', label: '长篇（20万字+）' },
]

const LANGUAGES = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: 'English' },
]

export function NewProjectDialog() {
  const { projectDialogOpen, setProjectDialogOpen } = useUIStore()
  const { createProject, loading, error } = useProjectStore()
  const [name, setName] = useState('未曾设想的道路')
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['sci-fi', 'romance'])
  const [mode, setMode] = useState('medium-novel')
  const [language, setLanguage] = useState('zh')

  // Clear stale error when dialog opens
  useEffect(() => {
    if (projectDialogOpen) {
      useProjectStore.setState({ error: null })
    }
  }, [projectDialogOpen])

  if (!projectDialogOpen) return null

  const toggleGenre = (key: string) => {
    setSelectedGenres((prev) => (prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]))
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    try {
      await createProject(name.trim(), { mode, language, genres: selectedGenres })
      setProjectDialogOpen(false)
    } catch {
      // error is already set in store → displayed in UI
    }
  }

  const activeBtn =
    'px-[14px] h-[30px] rounded-full border-none font-sans text-[13px] cursor-pointer bg-[var(--accent-gold)] text-[var(--canvas)] font-medium transition-all'
  const inactiveBtn =
    'px-[14px] h-[30px] rounded-full border-none font-sans text-[13px] cursor-pointer bg-[var(--canvas-mid)] text-[var(--ink-secondary)] hover:bg-[var(--canvas-pop)] transition-all'

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]"
      onClick={() => setProjectDialogOpen(false)}
    >
      <div
        className="bg-[var(--canvas-card)] border border-[var(--hairline-light)] rounded-xl p-8 w-[520px] max-w-[90vw] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-[28px] font-semibold leading-[1.3] mb-1">新建项目</h2>
        <p className="text-[var(--ink-tertiary)] text-[13px] mb-6">选择创作类型，mythpen 会自动匹配写作工具</p>

        {/* Error message */}
        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-[13px] text-red-500">
            {error}
          </div>
        )}

        <div className="mb-5">
          <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1.5">
            项目名称
          </label>
          <input
            type="text"
            className="w-full h-9 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-lg px-3 font-sans text-[15px] text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent-gold)] focus:shadow-[0_0_0_2px_rgba(201,169,110,0.2)]"
            placeholder="给小说取个名字..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="mb-5">
          <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1.5">
            创作类型（可多选）
          </label>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <button
                key={g.key}
                className={selectedGenres.includes(g.key) ? activeBtn : inactiveBtn}
                onClick={() => toggleGenre(g.key)}
              >
                {g.icon} {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1.5">
            写作模式
          </label>
          <div className="flex gap-2">
            {MODES.map((m) => (
              <button key={m.key} className={mode === m.key ? activeBtn : inactiveBtn} onClick={() => setMode(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1.5">
            写作语言
          </label>
          <div className="flex gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l.key}
                className={language === l.key ? activeBtn : inactiveBtn}
                onClick={() => setLanguage(l.key)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-[var(--hairline)]">
          <button
            className="h-[34px] px-5 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[13px] cursor-pointer transition-colors hover:bg-[var(--canvas-mid)]"
            onClick={() => setProjectDialogOpen(false)}
          >
            取消
          </button>
          <button
            className="h-[34px] px-5 rounded-lg border-none bg-[var(--accent-gold)] text-[var(--canvas)] font-medium text-[13px] cursor-pointer transition-colors hover:bg-[var(--accent-gold-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleCreate}
            disabled={loading || !name.trim()}
          >
            {loading ? '创建中…' : '开始创作'}
          </button>
        </div>
      </div>
    </div>
  )
}
