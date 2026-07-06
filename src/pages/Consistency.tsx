import { CheckCircle2, Loader, SearchCheck, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/hooks/useT'
import { aiApi, chaptersApi, foreshadowsApi, getAIResponseText, extractAIJsonArray } from '@/lib/api'
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
            tag: '伏笔预警',
            severity: 'warn',
            title: `"${f.title}"预期回收章落后于当前进度`,
            desc: `伏笔埋设于第${f.planted_chapter_id}章，预期第${f.expected_resolve_chapter}章回收，当前已写到第${maxChapterNum}章。`,
            loc: `伏笔 #${(f.id || '').slice(0, 8)}`,
          })
          warnings++
        }
      }

      for (const ch of chapters || []) {
        if (ch.status === 'pending' && (ch.word_count || 0) > 0) {
          found.push({
            tag: '状态异常',
            severity: 'warn',
            title: `第${ch.num}章 "${ch.title}" 有内容但状态为待办`,
            desc: `该章节有 ${ch.word_count} 字内容，但状态仍标记为「待办」。`,
            loc: `第${ch.num}章`,
          })
          warnings++
        }
      }

      setIssues(found)
      setStats({ passed: Math.max(0, chapters?.length - found.length), conflicts, warnings, sciErrors: 0 })
    } catch (e) {}
    setLoading(false)
  }, [project])

  const handleDeepCheck = async () => {
    if (!project) return
    setDeepChecking(true)
    try {
      const [chapters, foreshadows] = await Promise.all([chaptersApi.list(project), foreshadowsApi.list(project)])

      const chSummary = (chapters || [])
        .map((c: any) => `第${c.num}章 "${c.title}" 状态:${c.status} 字数:${c.word_count}`)
        .join('\n')
      const fSummary = (foreshadows || [])
        .map((f: any) => `${f.title} 状态:${f.status} 优先级:${f.priority}`)
        .join('\n')

      const res = await aiApi.chat(
        [
          {
            role: 'system',
            content:
              '你是一个小说创作一致性检查专家。分析以下章节状态和伏笔数据，找出所有一致性问题。' +
              '检查项包括：伏笔逾期未回收、章节状态异常、伏笔计划不合理等。' +
              '直接返回JSON数组，每个问题格式：{"tag":"问题分类","severity":"warn|error","title":"标题","desc":"详细描述"}。' +
              '不要前缀说明。如果无问题返回空数组[]。',
          },
          {
            role: 'user',
            content: `章节概览：\n${chSummary}\n\n伏笔概览：\n${fSummary}\n\n请进行一致性检查。`,
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
            {loading ? '检查中...' : t('pages.quickScan')}
          </button>
          <button
            className="btn-primary flex items-center gap-1.5"
            style={{ height: 30, padding: '0 14px' }}
            onClick={handleDeepCheck}
            disabled={deepChecking}
          >
            {deepChecking ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <SearchCheck className="w-3.5 h-3.5" />}
            {deepChecking ? 'AI 分析中...' : t('pages.deepCheck')}
          </button>
        </div>
      </div>
      <div className="page-body">
        <div className="flex gap-3 pb-4 border-b border-[var(--hairline)] mb-4">
          <StatCard label="通过检查" value={String(stats.passed)} color="var(--success)" />
          <StatCard label="冲突" value={String(stats.conflicts)} color="var(--accent-gold)" />
          <StatCard label="警告" value={String(stats.warnings)} color="var(--warning)" />
          <StatCard label="科学错误" value={String(stats.sciErrors)} color="var(--ink-tertiary)" />
        </div>

        {loading || deepChecking ? (
          <div className="text-center py-10 text-[var(--ink-tertiary)]">
            {deepChecking ? 'AI 正在分析项目数据...' : '分析中...'}
          </div>
        ) : issues.length === 0 ? (
          <div className="text-center py-10 text-[var(--ink-tertiary)]">
            <CheckCircle2 className="w-4 h-4 inline-block mr-1" />
            未发现一致性问题
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
