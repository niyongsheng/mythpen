import { BookOpen, Database, Pen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { projectsApi } from '@/lib/api'
import { useStats } from '@/lib/useProjectData'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSettingsStore } from '@/stores/useSettingsStore'

export function BottomStatusbar() {
  const { currentProject } = useProjectStore()
  const { data: stats, reload: reloadStats } = useStats()
  const settings = useSettingsStore((s) => s.settings)
  const totalTokens = (stats?.tokenInput || 0) + (stats?.tokenOutput || 0)

  const [backendOnline, setBackendOnline] = useState(true)
  const [writingLang, setWritingLang] = useState('中文')
  const [modelName, setModelName] = useState(settings.apiModel || 'DeepSeek Chat')
  const mountedRef = useRef(true)

  // Keep mountedRef in sync
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Auto-refresh stats every 30s
  useEffect(() => {
    const interval = setInterval(() => reloadStats(), 30000)
    return () => clearInterval(interval)
  }, [reloadStats])

  // Backend health check
  useEffect(() => {
    const check = async () => {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 3000)
        const res = await fetch('/api/health', { signal: controller.signal })
        clearTimeout(timer)
        if (mountedRef.current) setBackendOnline(res.ok)
      } catch {
        if (mountedRef.current) setBackendOnline(false)
      }
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  // Load writing language from project metadata
  useEffect(() => {
    if (!currentProject) return
    projectsApi
      .get(currentProject)
      .then((meta: any) => {
        if (mountedRef.current) {
          setWritingLang(meta.language === 'en' ? 'English' : '中文')
        }
      })
      .catch(() => {})
  }, [currentProject])

  // Sync model name from settings
  useEffect(() => {
    if (mountedRef.current) {
      setModelName(settings.apiModel || 'DeepSeek Chat')
    }
  }, [settings.apiModel])

  return (
    <div className="h-7 bg-[var(--canvas-soft)] border-t border-[var(--hairline)] flex items-center px-3 gap-4 shrink-0 font-mono text-[11px] text-[var(--ink-mute)]">
      <span className="inline-flex items-center gap-1">
        <BookOpen className="w-3 h-3" /> {currentProject}
      </span>
      <span>
        {(stats?.totalWords || 0).toLocaleString()} 字 · {stats?.chapterCount || 0} 章
      </span>

      <span className="inline-flex items-center gap-1 text-[10px] px-[7px] py-[1px] rounded-full bg-[var(--canvas-card)] border border-[var(--hairline)] text-[var(--ink-tertiary)]">
        UI: {settings.uiLanguage === 'zh' ? '中文' : 'English'}
      </span>
      <span
        className="inline-flex items-center gap-1 text-[10px] px-[7px] py-[1px] rounded-full bg-[var(--canvas-card)] border"
        style={{ color: 'var(--accent-gold)', borderColor: 'rgba(201,169,110,0.3)' }}
      >
        <Pen className="w-3 h-3" /> 写作: {writingLang}
      </span>

      <div className="ml-auto flex items-center gap-4">
        <span>Token: {totalTokens.toLocaleString()}</span>
        <span className="inline-flex items-center gap-1.5 px-2 py-[2px] rounded-full bg-[var(--canvas-card)] border border-[var(--hairline)]">
          <span
            className={`w-[7px] h-[7px] rounded-full ${backendOnline ? 'bg-[var(--success)]' : 'bg-red-500'}`}
            style={{ boxShadow: backendOnline ? '0 0 0 2px rgba(76,175,125,0.2)' : '0 0 0 2px rgba(239,68,68,0.2)' }}
          />
          {backendOnline ? 'Backend' : '离线'}
        </span>
        <span className="text-[10px] inline-flex items-center gap-1">
          <Database className="w-3 h-3" /> SQLite
        </span>
        <span>{modelName}</span>
      </div>
    </div>
  )
}
