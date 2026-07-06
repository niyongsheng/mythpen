import { Brain, Loader, Search, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { useT } from '@/hooks/useT'
import { aiApi, memoriesApi, getAIResponseText, extractAIJsonArray } from '@/lib/api'
import { useMemories, useProjectName } from '@/lib/useProjectData'

const CAT_LABELS: Record<string, string> = {
  character: '角色',
  location: '地点',
  event: '事件',
  promise: '承诺',
  item: '物品',
  other: '其他',
}
const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  character: { bg: 'rgba(201,169,110,0.18)', text: 'var(--accent-gold)' },
  location: { bg: 'rgba(122,142,168,0.18)', text: 'var(--accent-mist)' },
  event: { bg: 'var(--info-soft)', text: 'var(--info)' },
  promise: { bg: 'var(--warning-soft)', text: 'var(--warning)' },
  item: { bg: 'var(--success-soft)', text: 'var(--success)' },
}

export function Memory() {
  const { data: memories, loading, reload } = useMemories()
  const { t } = useT()
  const project = useProjectName()
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [extracting, setExtracting] = useState(false)

  const handleSearch = async () => {
    if (!project || !searchQuery.trim()) return
    setSearching(true)
    try {
      const results = await memoriesApi.search(project, searchQuery.trim())
      setSearchResults(results)
    } catch {
      setSearchResults([])
    }
    setSearching(false)
  }

  const handleClearSearch = () => {
    setSearchMode(false)
    setSearchQuery('')
    setSearchResults(null)
  }

  const handleExtract = async () => {
    if (!project) return
    setExtracting(true)
    try {
      const res = await aiApi.chat(
        [
          {
            role: 'system',
            content:
              '你是一个叙事记忆提取助手。从小说章节内容中提取重要的叙事记忆——对后续情节有影响的情节承诺、角色线索、设定关键点。' +
              '每个记忆用一句话概括。直接返回JSON数组，格式：[{"category":"character|location|item|event|promise|other","content":"..."}]，不要前缀说明。',
          },
          { role: 'user', content: '请提取当前小说的所有重要叙事记忆。' },
        ],
        project,
      )
      const text = getAIResponseText(res)
      const items = extractAIJsonArray(text)
      if (items) {
        await Promise.all(
          items.map((item: any) =>
            memoriesApi.create(project, {
              category: item.category || 'other',
              content: item.content,
            }),
          ),
        )
        reload()
      }
    } catch (e) {
      console.error('AI extract memories failed:', e)
    }
    setExtracting(false)
  }

  const displayList = searchResults !== null ? searchResults : memories || []

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">加载中...</div>

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <Brain className="w-5 h-5" /> {t('pages.narrativeMemory')}
        </h2>
        <div className="page-header-actions">
          <button
            className="btn-secondary flex items-center gap-1.5"
            style={{ height: 30, padding: '0 14px' }}
            onClick={() => setSearchMode(!searchMode)}
          >
            <Search className="w-3.5 h-3.5" /> {t('pages.semanticSearch')}
          </button>
          <button
            className="btn-primary flex items-center gap-1.5"
            style={{ height: 30, padding: '0 14px' }}
            onClick={handleExtract}
            disabled={extracting}
          >
            {extracting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {extracting ? '提取中...' : t('pages.aiExtract')}
          </button>
        </div>
      </div>

      {/* Search bar */}
      {searchMode && (
        <div className="px-6 py-3 border-b border-[var(--hairline)] bg-[var(--canvas-soft)]">
          <div className="flex gap-2 max-w-[500px]">
            <input
              type="text"
              className="w-full h-8 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-lg px-3 font-sans text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent-gold)]"
              placeholder="搜索记忆内容..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              autoFocus
            />
            <button
              className="h-8 px-4 min-w-[72px] rounded-lg bg-[var(--accent-gold)] text-[var(--canvas)] text-[12px] cursor-pointer border-none font-medium whitespace-nowrap"
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
            >
              {searching ? '搜索中...' : '搜索'}
            </button>
            <button
              className="h-8 w-8 rounded-lg flex items-center justify-center border border-[var(--hairline)] bg-[var(--canvas-elevated)] text-[var(--ink-tertiary)] cursor-pointer hover:text-[var(--ink)]"
              onClick={handleClearSearch}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {searchResults !== null && (
            <div className="text-[12px] text-[var(--ink-tertiary)] mt-1.5">
              {searchResults.length === 0 ? '未找到匹配的记忆' : `找到 ${searchResults.length} 条匹配结果`}
              <button
                className="ml-2 text-[var(--accent-gold)] underline cursor-pointer bg-transparent border-none"
                onClick={() => {
                  setSearchResults(null)
                  setSearchQuery('')
                }}
              >
                显示全部
              </button>
            </div>
          )}
        </div>
      )}

      <div className="page-body" style={{ padding: 0 }}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 p-6">
          {displayList.map((m: any) => {
            const color = CAT_COLORS[m.category] || { bg: 'var(--canvas-mid)', text: 'var(--ink-tertiary)' }
            return (
              <div
                key={m.id}
                className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-3.5 transition-colors hover:border-[var(--hairline-light)] hover:bg-[var(--canvas-elevated)]"
              >
                <span
                  className="text-[10px] px-[7px] py-[1px] rounded-full inline-block mb-2"
                  style={{ background: color.bg, color: color.text }}
                >
                  {CAT_LABELS[m.category] || m.category}
                </span>
                <div className="text-[13px] text-[var(--ink-secondary)] leading-[1.6]">{m.content}</div>
                <div className="text-[11px] text-[var(--ink-mute)] mt-2 font-mono">
                  {m.source_chapter_id ? `来源: 第${m.source_chapter_id}章` : ''}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
