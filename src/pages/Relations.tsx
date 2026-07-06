import { HeartHandshake, Link2, Loader, Plus, RefreshCcw, Sparkles, Users } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useT } from '@/hooks/useT'
import { aiApi, relationsApi, getAIResponseText, extractAIJsonArray } from '@/lib/api'
import { useCharacters, useProjectName, useRelations } from '@/lib/useProjectData'

interface PositionedNode {
  id: string
  name: string
  radius: number
  color: string
  labelColor: string
  fontSize: number
  x: number
  y: number
  chapterCount: number
}

interface PositionedLink {
  source: string
  target: string
  type: string
  intensity: number
  color: string
  dashed: boolean
  label: string
}

const ROLE_COLORS: Record<string, string> = {
  major: 'var(--accent-gold)',
  minor: 'var(--accent-mist)',
  extra: 'var(--canvas-mid)',
}
const ROLE_LABEL_COLORS: Record<string, string> = {
  major: 'var(--canvas)',
  minor: 'var(--ink)',
  extra: 'var(--ink-secondary)',
}

const EDGE_COLORS = {
  pos: 'var(--accent-gold)',
  neg: 'var(--accent-ember)',
  neutral: 'var(--ink-mute)',
}

function getEdgeColor(type: string): string {
  const pos = ['恋人', '情侣', '夫妻', '好友', '师徒', '兄妹', '亲人', '盟友', '朋友', '爱人', '兄弟', '姐妹']
  const neg = ['宿敌', '仇人', '敌人', '对手', '死对头', '竞争者']
  if (pos.some((t) => type.includes(t))) return EDGE_COLORS.pos
  if (neg.some((t) => type.includes(t))) return EDGE_COLORS.neg
  return EDGE_COLORS.neutral
}

// ─── Helpers ───
function hash(s: number, i: number) {
  return ((s * 9301 + i * 49297) % 233280) / 233280
}

function computeCircleLayout(
  characters: any[],
  relations: any[],
  seed = 0,
): { nodes: PositionedNode[]; links: PositionedLink[] } {
  const cx = 400,
    cy = 250,
    rx = 260,
    ry = 170
  const count = characters.length
  const maxCh = Math.max(...characters.map((ch) => ch.chapterCount || 0), 1)

  const nodes: PositionedNode[] = characters.map((c, i) => {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2 + hash(seed, i) * 0.15
    const r = 24 + ((c.chapterCount || 0) / maxCh) * 20
    const ch = c.chapterCount || 0
    const role = ch >= 3 ? 'major' : ch >= 1 ? 'minor' : 'extra'
    return {
      id: c.id,
      name: c.name,
      radius: Math.max(22, Math.min(r, 44)),
      color: ROLE_COLORS[role] || ROLE_COLORS.extra,
      labelColor: ROLE_LABEL_COLORS[role] || ROLE_LABEL_COLORS.extra,
      fontSize: r > 32 ? 13 : 11,
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
      chapterCount: c.chapterCount || 0,
    }
  })

  const nodeMap = new Map(characters.map((c) => [c.id, c.name]))

  const links: PositionedLink[] = relations
    .filter((r) => nodeMap.has(r.character_a_id) && nodeMap.has(r.character_b_id))
    .map((r) => ({
      source: r.character_a_id,
      target: r.character_b_id,
      type: r.relation_type,
      intensity: r.intensity || 3,
      color: getEdgeColor(r.relation_type),
      dashed: !!r.ended_at,
      label: r.relation_type,
    }))

  return { nodes, links }
}

export function Relations() {
  const { data: characters, loading: charsLoading } = useCharacters()
  const { data: relations, loading: relsLoading, reload: reloadRels } = useRelations()
  const { t } = useT()
  const project = useProjectName()
  const [layoutSeed, setLayoutSeed] = useState(0)
  const [organizing, setOrganizing] = useState(false)
  const [orgMsg, setOrgMsg] = useState('')

  const loading = charsLoading || relsLoading
  const chars = characters || []
  const rels = relations || []

  const { nodes, links } = useMemo(() => computeCircleLayout(chars, rels, layoutSeed), [chars, rels, layoutSeed])
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const handleRelayout = useCallback(() => {
    setLayoutSeed((s) => s + 1)
  }, [])

  const handleOrganize = async () => {
    if (!project) return
    setOrganizing(true)
    setOrgMsg('')
    try {
      const charList = chars
        .map((c: any) => {
          const ch = c.chapterCount || 0
          const role = ch >= 3 ? '主角' : ch >= 1 ? '配角' : '其他'
          return `${c.name}（${role}）`
        })
        .join('、')
      const existingRels = rels
        .map((r: any) => {
          const a = chars.find((c: any) => c.id === r.character_a_id)?.name || r.character_a_id
          const b = chars.find((c: any) => c.id === r.character_b_id)?.name || r.character_b_id
          return `${a} → ${b}: ${r.relation_type}`
        })
        .join('\n')

      const res = await aiApi.chat(
        [
          {
            role: 'system',
            content:
              '你是一个角色关系分析助手。分析角色列表，推断他们之间可能存在但尚未记录的角色关系。' +
              '直接返回JSON数组，格式：[{"character_a_name":"...","character_b_name":"...","relation_type":"...","description":"...","intensity":3}]。' +
              'intensity 1-5。只建议合理的关系，不要强行关联。不要前缀说明。',
          },
          {
            role: 'user',
            content: `角色：${charList}\n\n已有关系：\n${existingRels || '暂无'}\n\n请推断可能存在的其他角色关系。`,
          },
        ],
        project,
      )
      const text = getAIResponseText(res)
      const suggestions = extractAIJsonArray(text)
      if (!suggestions) {
        setOrgMsg('AI 未能生成建议')
        setOrganizing(false)
        return
      }
      let created = 0

      const charMap = new Map(chars.map((c: any) => [c.name, c]))
      const existingPairs = new Set(rels.map((r: any) => [r.character_a_id, r.character_b_id].sort().join(':')))
      const createOps = []
      for (const s of suggestions) {
        const a = charMap.get(s.character_a_name)
        const b = charMap.get(s.character_b_name)
        if (!a || !b) continue
        const pairKey = [a.id, b.id].sort().join(':')
        if (existingPairs.has(pairKey)) continue
        createOps.push(
          relationsApi.create(project, {
            character_a_id: a.id,
            character_b_id: b.id,
            relation_type: s.relation_type,
            description: s.description || '',
            intensity: s.intensity || 3,
          }),
        )
      }
      const results = await Promise.all(createOps)
      created = results.length
      await reloadRels()
      setOrgMsg(created > 0 ? `已创建 ${created} 条新关系` : '未发现需要添加的新关系')
    } catch (e) {
      console.error('AI organize failed:', e)
      setOrgMsg('分析出错')
    }
    setOrganizing(false)
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">加载中...</div>
  }

  if (chars.length === 0) {
    return (
      <>
        <div className="page-header">
          <h2 className="flex items-center gap-2">
            <HeartHandshake className="w-5 h-5" /> {t('pages.relationGraph')}
          </h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--ink-tertiary)] gap-3">
          <Users className="w-12 h-12 opacity-30" />
          <p className="text-[15px]">还没有角色，先创建角色才能构建关系图谱</p>
        </div>
      </>
    )
  }

  const sortedByChapter = [...chars].sort((a, b) => (b.chapterCount || 0) - (a.chapterCount || 0))
  const relTypeCount = new Map<string, number>()
  rels.forEach((r) => relTypeCount.set(r.relation_type, (relTypeCount.get(r.relation_type) || 0) + 1))
  const sortedRelTypes = [...relTypeCount.entries()].sort((a, b) => b[1] - a[1])

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <HeartHandshake className="w-5 h-5" /> {t('pages.relationGraph')}
        </h2>
        <div className="page-header-actions">
          <button
            className="btn-secondary flex items-center gap-1.5"
            style={{ height: 30, padding: '0 14px' }}
            onClick={handleRelayout}
          >
            <RefreshCcw className="w-3.5 h-3.5" /> {t('pages.reLayout')}
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        {/* Graph */}
        <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-[var(--canvas)]">
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 800 500"
            preserveAspectRatio="xMidYMid meet"
            style={{ maxHeight: '100%' }}
          >
            <defs>
              {links.map((link, i) => {
                const from = nodeById.get(link.source)
                const to = nodeById.get(link.target)
                if (!from || !to) return null
                return (
                  <marker
                    key={`arrow-${i}`}
                    id={`arrow-${i}`}
                    viewBox="0 0 8 8"
                    refX="8"
                    refY="4"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8 Z" fill={link.color} />
                  </marker>
                )
              })}
            </defs>

            {/* Edges */}
            {links.map((link, i) => {
              const from = nodeById.get(link.source)
              const to = nodeById.get(link.target)
              if (!from || !to) return null
              const mx = (from.x + to.x) / 2
              const my = (from.y + to.y) / 2 - 14
              const labelW = link.label.length * 7 + 12
              return (
                <g key={`link-${i}`}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={link.color}
                    strokeWidth={1 + link.intensity * 0.6}
                    strokeLinecap="round"
                    strokeDasharray={link.dashed ? '6,4' : undefined}
                    markerEnd={`url(#arrow-${i})`}
                    opacity="0.7"
                  />
                  {/* Label background */}
                  <rect
                    x={mx - labelW / 2}
                    y={my - 8}
                    width={labelW}
                    height={16}
                    rx="4"
                    fill="var(--canvas-card)"
                    stroke="var(--hairline)"
                    strokeWidth="0.5"
                  />
                  <text
                    x={mx}
                    y={my + 3}
                    fill="var(--ink-mute)"
                    fontSize="10"
                    fontFamily="Inter,sans-serif"
                    textAnchor="middle"
                  >
                    {link.label}
                  </text>
                </g>
              )
            })}

            {/* Nodes */}
            {nodes.map((node) => (
              <g key={node.id}>
                {/* Glow for major characters */}
                {node.color === ROLE_COLORS.major && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.radius + 4}
                    fill="none"
                    stroke={node.color}
                    strokeWidth="1"
                    opacity="0.3"
                  />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius}
                  fill={node.color}
                  stroke={node.color === ROLE_COLORS.major ? 'var(--accent-gold)' : 'var(--hairline-light)'}
                  strokeWidth={node.color === ROLE_COLORS.major ? 2.5 : 1.5}
                />
                <text
                  x={node.x}
                  y={node.y + 3}
                  fill={node.labelColor}
                  fontSize={node.fontSize}
                  fontFamily="Noto Serif SC,serif"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ userSelect: 'none' }}
                >
                  {node.name}
                </text>
              </g>
            ))}

            {rels.length === 0 && chars.length > 0 && (
              <text
                x="400"
                y="470"
                fill="var(--ink-mute)"
                fontSize="13"
                fontFamily="Inter,sans-serif"
                textAnchor="middle"
              >
                还没有关系连线，点击右侧「AI 整理图谱」自动生成
              </text>
            )}
          </svg>

          {/* Legend */}
          <div className="absolute bottom-3 right-3 bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-2.5 text-[11px] shadow-sm">
            <div className="flex items-center gap-1.5 py-0.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ROLE_COLORS.major }} />
              {t('pages.roleMajor')}
            </div>
            <div className="flex items-center gap-1.5 py-0.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ROLE_COLORS.minor }} />
              {t('pages.roleMinor')}
            </div>
            <div className="flex items-center gap-1.5 py-0.5">
              <span className="w-3 h-[2px] shrink-0" style={{ background: EDGE_COLORS.pos }} />
              {t('pages.legendRelationPos')}
            </div>
            <div className="flex items-center gap-1.5 py-0.5">
              <span className="w-3 h-[2px] shrink-0" style={{ background: EDGE_COLORS.neg }} />
              {t('pages.legendRelationNeg')}
            </div>
            <div className="flex items-center gap-1.5 py-0.5">
              <span className="w-3 h-[2px] shrink-0" style={{ background: EDGE_COLORS.neutral }} />
              {t('pages.legendRelationNeutral')}
            </div>
            <div className="text-[10px] text-[var(--ink-mute)] mt-1 pt-1 border-t border-[var(--hairline)]">
              {t('pages.legendWeight')}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-[220px] shrink-0 border-l border-[var(--hairline)] p-3 overflow-y-auto custom-scrollbar flex flex-col gap-3">
          {/* AI Organize */}
          <div className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-3">
            <button
              className="w-full h-[32px] rounded-lg bg-[var(--accent-gold)] text-[var(--canvas)] text-[12px] font-medium cursor-pointer border-none flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleOrganize}
              disabled={organizing}
            >
              {organizing ? (
                <>
                  <Loader className="w-3.5 h-3.5 animate-spin" /> 分析中...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" /> AI 整理图谱
                </>
              )}
            </button>
            {orgMsg && <div className="text-[11px] text-[var(--ink-tertiary)] mt-2 text-center">{orgMsg}</div>}
          </div>

          {/* Character stats */}
          <div className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-3">
            <div className="text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-2 flex items-center gap-1.5">
              <Users className="w-3 h-3" /> 角色出场
            </div>
            {sortedByChapter.slice(0, 8).map((c: any, i) => (
              <div key={i} className="flex justify-between items-center py-[2px] text-[12px]">
                <span className="text-[var(--ink-mute)] truncate max-w-[130px]">{c.name}</span>
                <span className="font-mono text-[11px] text-[var(--ink-tertiary)]">{c.chapterCount || 0}章</span>
              </div>
            ))}
            {chars.length === 0 && (
              <div className="text-[12px] text-[var(--ink-tertiary)] py-2 text-center">暂无数据</div>
            )}
          </div>

          {/* Relation types */}
          <div className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-3">
            <div className="text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-2 flex items-center gap-1.5">
              <Link2 className="w-3 h-3" /> 关系类型
            </div>
            {sortedRelTypes.map(([type, count], i) => (
              <div key={i} className="flex justify-between items-center py-[2px] text-[12px]">
                <span className="text-[var(--ink-mute)] truncate max-w-[130px]">{type}</span>
                <span className="font-mono text-[11px] text-[var(--ink-tertiary)]">{count}</span>
              </div>
            ))}
            {rels.length === 0 && (
              <div className="text-[12px] text-[var(--ink-tertiary)] py-2 text-center">暂无关系</div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
