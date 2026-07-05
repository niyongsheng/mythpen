import type { LucideIcon } from 'lucide-react'
import { Book, Download, File, FileEdit, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '@/hooks/useT'
import { useProjectName } from '@/lib/useProjectData'

interface Format {
  icon: LucideIcon
  name: string
  descKey: string
  active?: boolean
}

const FORMATS: Format[] = [
  { icon: FileText, name: 'TXT', descKey: 'TXT', active: true },
  { icon: FileEdit, name: 'Markdown', descKey: 'MD' },
  { icon: Book, name: 'EPUB', descKey: 'EPUB' },
  { icon: File, name: 'PDF', descKey: 'PDF' },
]

export function ExportPage() {
  const [activeFormat, setActiveFormat] = useState('TXT')
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const project = useProjectName()
  const { t } = useT()

  const handleExport = async () => {
    setExporting(true)
    setExportMsg('')
    try {
      const fmt = activeFormat === 'Markdown' ? 'md' : activeFormat.toLowerCase()
      const res = await fetch(`/api/${encodeURIComponent(project)}/export?format=${fmt}`)
      const data = await res.json()
      if (data.success) {
        setExportMsg(`导出成功！共 ${data.wordCount} 字 · ${data.chapterCount} 章`)
        // Trigger download
        const a = document.createElement('a')
        a.href = `/api/${encodeURIComponent(project)}/export?format=${fmt}&download=1`
        a.download = data.filename
        a.click()
      } else {
        setExportMsg('导出失败')
      }
    } catch (err: any) {
      setExportMsg(`导出失败: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <Download className="w-5 h-5" /> {t('pages.export')}
        </h2>
        <div className="page-header-actions">
          <button
            className="btn-primary"
            style={{ height: 30, padding: '0 14px' }}
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? '导出中...' : t('pages.exportAll')}
          </button>
        </div>
      </div>
      {exportMsg && (
        <div
          className="px-6 py-2 text-[13px]"
          style={{ color: exportMsg.startsWith('导出成功') ? 'var(--success)' : 'var(--error)' }}
        >
          {exportMsg}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 p-6">
        {FORMATS.map((f) => (
          <div
            key={f.name}
            className={`p-6 rounded-lg text-center cursor-pointer transition-colors
              ${
                activeFormat === f.name
                  ? 'bg-[var(--accent-gold-soft-bg)] border border-[var(--accent-gold)]'
                  : 'bg-[var(--canvas-card)] border border-[var(--hairline)] hover:border-[var(--accent-gold)] hover:bg-[var(--accent-gold-soft-bg)]'
              }`}
            onClick={() => setActiveFormat(f.name)}
          >
            {(() => {
              const Icon = f.icon
              return (
                <div className="mb-2">
                  <Icon className="w-9 h-9 mx-auto" />
                </div>
              )
            })()}
            <div className="text-[15px] text-[var(--ink)] mb-1">{f.name}</div>
            <div className="text-[13px] text-[var(--ink-tertiary)]">{f.descKey}</div>
          </div>
        ))}
      </div>

      <div className="px-6 pb-6">
        <div className="text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-3">
          {t('pages.exportFormat')}
        </div>
        <div className="flex items-center justify-between py-2.5 border-t border-[var(--hairline)] max-w-[500px] first:border-t-0">
          <div className="setting-label">{t('pages.exportAuthor')}</div>
          <input
            type="text"
            id="export-author"
            name="export-author"
            className="setting-input"
            style={{ width: 150, textAlign: 'left' }}
            defaultValue="佚名"
          />
        </div>
        <ToggleRow label={t('pages.exportCover')} defaultOn />
        <ToggleRow label={t('pages.exportTOC')} defaultOn />
      </div>

      <div className="px-6 pb-6 border-t border-[var(--hairline)] pt-4">
        <div className="text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-2">
          {t('pages.exportRecords')}
        </div>
        <div className="text-[13px] text-[var(--ink-tertiary)] py-4 text-center">暂无导出记录</div>
      </div>
    </>
  )
}

function ToggleRow({ label, defaultOn }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn ?? false)
  return (
    <div className="flex items-center justify-between py-2.5 border-t border-[var(--hairline)] max-w-[500px]">
      <div className="setting-label">{label}</div>
      <button
        className={`w-9 h-5 rounded-full border-none cursor-pointer relative transition-colors shrink-0 ${on ? 'bg-[var(--accent-gold)]' : 'bg-[var(--canvas-mid)]'}`}
        onClick={() => setOn(!on)}
      >
        <span
          className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-[var(--ink)] transition-transform ${on ? 'translate-x-4' : ''}`}
        />
      </button>
    </div>
  )
}
