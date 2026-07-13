import { Book, Download, File, FileEdit, FileText, type LucideIcon, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/hooks/useT'
import { projectsApi } from '@/lib/api'
import { useProjectName } from '@/lib/useProjectData'

interface Format {
  name: string
  label: string
  descKey: string
}

const FORMATS: Format[] = [
  { name: 'epub', label: 'EPUB', descKey: 'export.formatEpubDesc' },
  { name: 'html', label: 'HTML', descKey: 'export.formatHtmlDesc' },
  { name: 'md', label: 'Markdown', descKey: 'export.formatMdDesc' },
  { name: 'txt', label: 'TXT', descKey: 'export.formatTxtDesc' },
]

export function ExportPage() {
  const [activeFormat, setActiveFormat] = useState('epub')
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const [exportStatus, setExportStatus] = useState<'success' | 'error' | ''>('')
  const [coverUrl, setCoverUrl] = useState('')
  const [coverMime, setCoverMime] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const project = useProjectName()
  const { t } = useT()

  // Check if cover exists on mount and when project changes
  useEffect(() => {
    if (!project) return
    fetch(projectsApi.getCoverUrl(project))
      .then((r) => {
        if (r.ok) {
          setCoverMime(r.headers.get('content-type') || 'image/png')
          setCoverUrl(`${projectsApi.getCoverUrl(project)}?t=${Date.now()}`)
        } else {
          setCoverUrl('')
        }
      })
      .catch(() => setCoverUrl(''))
  }, [project])

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !project) return
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      try {
        await projectsApi.uploadCover(project, base64, file.type)
        setCoverUrl(`/api/${encodeURIComponent(project)}/cover?t=${Date.now()}`)
        setCoverMime(file.type)
      } catch (err: any) {
        setExportMsg(t('export.coverUploadError', { msg: err.message }))
        setExportStatus('error')
      }
    }
    reader.readAsDataURL(file)
  }

  const handleCoverDelete = async () => {
    if (!project) return
    try {
      await projectsApi.deleteCover(project)
      setCoverUrl('')
      setCoverMime('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: any) {
      setExportMsg(t('export.coverDeleteError', { msg: err.message }))
      setExportStatus('error')
    }
  }

  const handleExport = async () => {
    setExporting(true)
    setExportMsg('')
    try {
      const fmt = activeFormat
      // Single request: the backend generates + sends the file
      const a = document.createElement('a')
      a.href = `/api/${encodeURIComponent(project)}/export?format=${fmt}&download=1`
      const extMap: Record<string, string> = { epub: 'epub', html: 'html', md: 'md', txt: 'txt' }
      a.download = `${project}.${extMap[fmt] || 'txt'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setExportMsg(t('export.downloadingFile', { fmt: fmt.toUpperCase() }))
      setExportStatus('success')
      setTimeout(() => setExportMsg(''), 3000)
    } catch (err: any) {
      setExportMsg(t('export.exportError', { msg: err.message }))
      setExportStatus('error')
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
            {exporting ? t('export.exporting') : t('pages.exportAll')}
          </button>
        </div>
      </div>
      {exportMsg && (
        <div
          className="px-6 py-2 text-[13px]"
          style={{ color: exportStatus === 'success' ? 'var(--success)' : 'var(--error)' }}
        >
          {exportMsg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 p-6">
        {FORMATS.map((f) => (
          <div
            key={f.name}
            className={`p-5 rounded-lg text-center cursor-pointer transition-colors
              ${
                activeFormat === f.name
                  ? 'bg-[var(--accent-gold-soft-bg)] border border-[var(--accent-gold)]'
                  : 'bg-[var(--canvas-card)] border border-[var(--hairline)] hover:border-[var(--accent-gold)] hover:bg-[var(--accent-gold-soft-bg)]'
              }`}
            onClick={() => setActiveFormat(f.name)}
          >
            <div className="text-[24px] mb-1">
              {(() => {
                const icons: Record<string, LucideIcon> = { epub: Book, html: FileEdit, md: FileText, txt: File }
                const Icon = icons[f.name] || File
                return <Icon className="w-8 h-8 mx-auto" />
              })()}
            </div>
            <div className="text-[15px] text-[var(--ink)] mb-1">{f.label}</div>
            <div className="text-[12px] text-[var(--ink-tertiary)]">{t(f.descKey)}</div>
          </div>
        ))}
      </div>

      <div className="px-6 pb-6">
        <div className="text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-3">
          {t('pages.exportFormat')}
        </div>

        {/* Cover Upload */}
        <div className="flex items-start gap-4 py-2.5 border-t border-[var(--hairline)] max-w-[500px]">
          <div
            className="w-[80px] h-[110px] rounded-lg border border-[var(--hairline)] bg-[var(--canvas-card)] flex items-center justify-center overflow-hidden shrink-0"
            style={coverUrl ? {} : { borderStyle: 'dashed' }}
          >
            {coverUrl ? (
              <img src={coverUrl} alt={t('export.noCover')} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[11px] text-[var(--ink-tertiary)]">{t('export.noCover')}</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="setting-label" style={{ marginBottom: 0 }}>
              {t('pages.exportCover')}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleCoverUpload}
              style={{ display: 'none' }}
            />
            <div className="flex gap-2">
              <button
                className="h-[28px] px-3 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[11px] cursor-pointer transition-colors hover:bg-[var(--canvas-mid)] flex items-center gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-3 h-3" />
                {coverUrl ? t('export.changeCover') : t('export.uploadCover')}
              </button>
              {coverUrl && (
                <button
                  className="h-[28px] px-3 rounded-lg border border-red-500/25 bg-red-500/5 text-red-500 text-[11px] cursor-pointer transition-colors hover:bg-red-500/10 flex items-center gap-1"
                  onClick={handleCoverDelete}
                >
                  <Trash2 className="w-3 h-3" />
                  {t('export.deleteCover')}
                </button>
              )}
            </div>
            <span className="text-[10px] text-[var(--ink-tertiary)]">PNG / JPG / WebP / GIF</span>
          </div>
        </div>

        <div className="flex items-center justify-between py-2.5 border-t border-[var(--hairline)] max-w-[500px]">
          <div className="setting-label">{t('pages.exportAuthor')}</div>
          <input
            type="text"
            className="setting-input"
            style={{ width: 150, textAlign: 'left' }}
            defaultValue={t('export.defaultAuthor')}
          />
        </div>
      </div>

      <div className="px-6 pb-6 border-t border-[var(--hairline)] pt-4">
        <div className="text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-2">
          {t('pages.exportRecords')}
        </div>
        <div className="text-[13px] text-[var(--ink-tertiary)] py-4 text-center">{t('export.noExportRecords')}</div>
      </div>
    </>
  )
}
