import { CheckCircle2, Loader, SearchCheck, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/hooks/useT'
import { aiApi, chaptersApi, extractAIJsonArray, foreshadowsApi, getAIResponseText } from '@/lib/api'
import { useProjectName } from '@/lib/useProjectData'

export function Consistency() {
  const project = useProjectName()
  const [issues, setIssues] = useState<any[]>([])
  const [stats, setStats] = useState({ passed: 0, conflicts: 0, warnings: 0, sciErrors: 0 })
  const [loading, setLoading] = useState(true)
  const [deepChecking, setDeepChecking] = useState(false)
  const { t } = useT()

  const runCheck = useCallback(async () => {
    if (!project) return
    setLoading(true)
    try {
      const [chapters, foreshadows] = await Promise.all([chaptersApi.list(project), foreshadowsApi.list(project)])
      const found: any[] = []
      let conflicts = 0,
        warnings = 0

      const maxChapterNum = Math.max(...chapters.map((c: any) => c.num), 0)
      for (const f of foreshadows || []) {
        if (f.status === 'planted' && f.expected_resolve_chapter && f.expected_resolve_chapter <= maxChapterNum) {
          found.push({
            tag: t('consistency.foreshadowAlert'),
            severity: 'warn',
            title: t('consistency.foreshadowLate', { title: f.title }),
            desc: t('consistency.foreshadowDesc', {
              planted: f.planted_chapter_id,
              expected: f.expected_resolve_chapter,
              current: maxChapterNum,
            }),
            loc: t('consistency.foreshadowLoc', { id: (f.id || '').slice(0, 8) }),
          })
          warnings++
        }
      }

      for (const ch of chapters || []) {
        if (ch.status === 'pending' && (ch.word_count || 0) > 0) {
          found.push({
            tag: t('consistency.statusAbnormal'),
            severity: 'warn',
            title: t('consistency.chapterAbnormal', { num: ch.num, title: ch.title }),
            desc: t('consistency.chapterAbnormalDesc', { wordCount: ch.word_count }),
            loc: t('consistency.chapterLoc', { num: ch.num }),
          })
          warnings++
        }
      }

      setIssues(found)
      setStats({ passed: Math.max(0, chapters?.length - found.length), conflicts, warnings, sciErrors: 0 })
    } catch (e) {}
    setLoading(false)
  }, [project, t])

  const handleDeepCheck = async () => {
    if (!project) return
    setDeepChecking(true)
    try {
      const [chapters, foreshadows] = await Promise.all([chaptersApi.list(project), foreshadowsApi.list(project)])

      const chSummary = (chapters || [])
        .map((c: any) =>
          t('consistency.chapterSummary', { num: c.num, title: c.title, status: c.status, wordCount: c.word_count }),
        )
        .join('\n')
      const fSummary = (foreshadows || [])
        .map((f: any) => t('consistency.foreshadowSummary', { title: f.title, status: f.status, priority: f.priority }))
        .join('\n')

      const res = await aiApi.chat(
        [
          {
            role: 'system',
            content: t('consistency.systemPrompt'),
          },
          {
            role: 'user',
            content: t('consistency.userPrompt', { chSummary, fSummary }),
          },
        ],
        project,
      )
      const text = getAIResponseText(res)
      const aiIssues = extractAIJsonArray(text)
      if (aiIssues) {
        setIssues(aiIssues)
        const statsUpdate = { passed: 0, conflicts: 0, warnings: 0, sciErrors: 0 }
        for (const i of aiIssues) {
          if (i.severity === 'error') statsUpdate.conflicts++
          else statsUpdate.warnings++
        }
        setStats(statsUpdate)
      }
    } catch (e) {
      console.error('Deep check failed:', e)
    }
    setDeepChecking(false)
  }

  useEffect(() => {
    runCheck()
  }, [runCheck])

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" /> {t('pages.consistencyCheck')}
        </h2>
        <div className="page-header-actions">
          <button
            className="btn-secondary"
            style={{ height: 30, padding: '0 14px' }}
            onClick={runCheck}
            disabled={loading}
          >
            {loading ? t('consistency.checking') : t('pages.quickScan')}
          </button>
          <button
            className="btn-primary flex items-center gap-1.5"
            style={{ height: 30, padding: '0 14px' }}
            onClick={handleDeepCheck}
            disabled={deepChecking}
          >
            {deepChecking ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <SearchCheck className="w-3.5 h-3.5" />}
            {deepChecking ? t('consistency.aiAnalyzing') : t('pages.deepCheck')}
          </button>
        </div>
      </div>
      <div className="page-body">
        <div className="flex gap-3 pb-4 border-b border-[var(--hairline)] mb-4">
          <StatCard label={t('consistency.pass')} value={String(stats.passed)} color="var(--success)" />
          <StatCard label={t('consistency.conflict')} value={String(stats.conflicts)} color="var(--accent-gold)" />
          <StatCard label={t('consistency.warning')} value={String(stats.warnings)} color="var(--warning)" />
          <StatCard label={t('consistency.scienceError')} value={String(stats.sciErrors)} color="var(--ink-tertiary)" />
        </div>

        {loading || deepChecking ? (
          <div className="text-center py-10 text-[var(--ink-tertiary)]">
            {deepChecking ? t('consistency.aiAnalyzingData') : t('consistency.analyzing')}
          </div>
        ) : issues.length === 0 ? (
          <div className="text-center py-10 text-[var(--ink-tertiary)]">
            <CheckCircle2 className="w-4 h-4 inline-block mr-1" />
            {t('consistency.noIssues')}
          </div>
        ) : (
          <div style={{ maxWidth: 680 }}>
            {issues.map((issue, i) => (
              <div key={i} className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-3 mb-2.5">
                <div className="flex gap-1.5 items-start">
                  <span
                    className={`text-[9px] px-[5px] py-[1px] rounded-full shrink-0 mt-[1px]
                    ${issue.severity === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'}`}
                  >
                    {issue.tag}
                  </span>
                  <span className="flex-1">
                    <div style={{ color: 'var(--ink)', marginBottom: 4 }}>{issue.title}</div>
                    <div style={{ color: 'var(--ink-tertiary)', fontSize: 12 }}>{issue.desc}</div>
                    {issue.loc && (
                      <div style={{ marginTop: 6 }}>
                        <span className="font-mono text-[var(--ink-mute)] text-[10px]">{issue.loc}</span>
                      </div>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg px-5 py-3 min-w-[100px] text-center">
      <div className="font-mono text-lg" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-[var(--ink-tertiary)] mt-0.5">{label}</div>
    </div>
  )
}
