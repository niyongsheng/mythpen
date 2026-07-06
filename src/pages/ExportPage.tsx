import { Book, Download, File, FileEdit, FileText, type LucideIcon, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/hooks/useT'
import { projectsApi } from '@/lib/api'
import { useProjectName } from '@/lib/useProjectData'

interface Format {
  name: string
  label: string
  descKey: string
  active?: boolean
}

const FORMATS: Format[] = [
  { name: 'epub', label: 'EPUB', descKey: '电子书格式，支持封面' },
  { name: 'html', label: 'HTML', descKey: '网页格式，可打印为 PDF' },
  { name: 'md', label: 'Markdown', descKey: 'Markdown 文档' },
  { name: 'txt', label: 'TXT', descKey: '纯文本格式' },
]

export function ExportPage() {
  const [activeFormat, setActiveFormat] = useState('epub')
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
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
        setExportMsg(`封面上传失败: ${err.message}`)
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
      setExportMsg(`封面删除失败: ${err.message}`)
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
      setExportMsg(`正在下载${fmt.toUpperCase()}文件...`)
      setTimeout(() => setExportMsg(''), 3000)
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
            <div className="text-[12px] text-[var(--ink-tertiary)]">{f.descKey}</div>
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
              <img src={coverUrl} alt="封面" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[11px] text-[var(--ink-tertiary)]">无封面</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="setting-label" style={{ marginBottom: 0 }}>
              包含封面
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
                {coverUrl ? '更换' : '上传'}
              </button>
              {coverUrl && (
                <button
                  className="h-[28px] px-3 rounded-lg border border-red-500/25 bg-red-500/5 text-red-500 text-[11px] cursor-pointer transition-colors hover:bg-red-500/10 flex items-center gap-1"
                  onClick={handleCoverDelete}
                >
                  <Trash2 className="w-3 h-3" />
                  删除
                </button>
              )}
            </div>
            <span className="text-[10px] text-[var(--ink-tertiary)]">PNG / JPG / WebP / GIF</span>
          </div>
        </div>

        <div className="flex items-center justify-between py-2.5 border-t border-[var(--hairline)] max-w-[500px]">
          <div className="setting-label">{t('pages.exportAuthor')}</div>
          <input type="text" className="setting-input" style={{ width: 150, textAlign: 'left' }} defaultValue="佚名" />
        </div>
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
