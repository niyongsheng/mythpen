import { HeartHandshake, Link2, Plus, RefreshCcw, Users } from 'lucide-react'
import { useT } from '@/hooks/useT'
import { useCharacters, useRelations } from '@/lib/useProjectData'

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

function computeCircleLayout(
  characters: any[],
  relations: any[],
): { nodes: PositionedNode[]; links: PositionedLink[] } {
  const cx = 300,
    cy = 200,
    rx = 180,
    ry = 120
  const count = characters.length

  const nodes: PositionedNode[] = characters.map((c, i) => {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2
    const maxCh = Math.max(...characters.map((ch) => ch.chapterCount || 0), 1)
    const radius = 24 + ((c.chapterCount || 0) / maxCh) * 20
    const role = (c.role || 'extra') as string
    return {
      id: c.id,
      name: c.name,
      radius: Math.max(22, Math.min(radius, 44)),
      color: ROLE_COLORS[role] || ROLE_COLORS.extra,
      labelColor: ROLE_LABEL_COLORS[role] || ROLE_LABEL_COLORS.extra,
      fontSize: radius > 32 ? 13 : 11,
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
      chapterCount: c.chapterCount || 0,
    }
  })

  const nodeMap = new Map(characters.map((c) => [c.id, c.name]))

  const links: PositionedLink[] = relations
    .filter((r) => nodeMap.has(r.characterAId) && nodeMap.has(r.characterBId))
    .map((r) => {
      const posColor = 'var(--accent-gold)'
      const negColor = 'var(--accent-ember)'
      const neutralColor = 'var(--ink-mute)'
      const posTypes = ['恋人', '情侣', '夫妻', '好友', '师徒', '兄妹', '亲人', '盟友']
      const negTypes = ['宿敌', '仇人', '敌人', '对手', '死对头']
      let color = neutralColor
      if (posTypes.some((t) => r.relationType.includes(t))) color = posColor
      else if (negTypes.some((t) => r.relationType.includes(t))) color = negColor

      return {
        source: r.characterAId,
        target: r.characterBId,
        type: r.relationType,
        intensity: r.intensity || 3,
        color,
        dashed: !!r.endedAt,
        label: r.relationType,
      }
    })

  return { nodes, links }
}

export function Relations() {
  const { data: characters, loading: charsLoading } = useCharacters()
  const { data: relations, loading: relsLoading } = useRelations()
  const { t } = useT()

  const loading = charsLoading || relsLoading

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">加载中...</div>
  }

  const chars = characters || []
  const rels = relations || []

  if (chars.length === 0) {
    return (
      <>
        <div className="page-header">
          <h2 className="flex items-center gap-2">
            <HeartHandshake className="w-5 h-5" /> {t('pages.relationGraph')}
          </h2>
          <div className="page-header-actions">
            <button className="btn-primary flex items-center gap-1" style={{ height: 30, padding: '0 14px' }}>
              <Plus className="w-3.5 h-3.5" /> {t('pages.newRelation')}
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--ink-tertiary)] gap-3">
          <Users className="w-12 h-12 opacity-30" />
          <p className="text-[15px]">还没有角色，先创建角色才能构建关系图谱</p>
        </div>
      </>
    )
  }

  const { nodes, links } = computeCircleLayout(chars, rels)

  // Stats for sidebar
  const sortedByChapter = [...chars].sort((a, b) => (b.chapterCount || 0) - (a.chapterCount || 0))
  const relTypeCount = new Map<string, number>()
  rels.forEach((r) => {
    relTypeCount.set(r.relationType, (relTypeCount.get(r.relationType) || 0) + 1)
  })
  const sortedRelTypes = [...relTypeCount.entries()].sort((a, b) => b[1] - a[1])

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <HeartHandshake className="w-5 h-5" /> {t('pages.relationGraph')}
        </h2>
        <div className="page-header-actions">
          <button className="btn-secondary flex items-center gap-1.5" style={{ height: 30, padding: '0 14px' }}>
            <RefreshCcw className="w-3.5 h-3.5" /> {t('pages.reLayout')}
          </button>
          <button className="btn-primary flex items-center gap-1" style={{ height: 30, padding: '0 14px' }}>
            <Plus className="w-3.5 h-3.5" /> {t('pages.newRelation')}
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex items-center justify-center relative overflow-hidden">
          <svg width="100%" height="100%" viewBox="0 0 600 400" style={{ background: 'var(--canvas)' }}>
            {/* Edges */}
            {links
              .filter((link) => nodes.find((n) => n.id === link.source) && nodes.find((n) => n.id === link.target))
              .map((link, i) => {
                const from = nodes.find((n) => n.id === link.source)!
                const to = nodes.find((n) => n.id === link.target)!
                const mx = (from.x + to.x) / 2
                const my = (from.y + to.y) / 2 - 12
                return (
                  <g key={`link-${i}`}>
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={link.color}
                      strokeWidth={1 + link.intensity}
                      strokeLinecap="round"
                      strokeDasharray={link.dashed ? '5,4' : undefined}
                    />
                    <text
                      x={mx}
                      y={my}
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
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius}
                  fill={node.color}
                  stroke="var(--hairline-light)"
                  strokeWidth="2"
                />
                <text
                  x={node.x}
                  y={node.y + 3}
                  fill={node.labelColor}
                  fontSize={node.fontSize}
                  fontFamily="Noto Serif SC,serif"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {node.name}
                </text>
              </g>
            ))}

            {rels.length === 0 && chars.length > 0 && (
              <text
                x="300"
                y="380"
                fill="var(--ink-mute)"
                fontSize="12"
                fontFamily="Inter,sans-serif"
                textAnchor="middle"
              >
                还没有关系连线，点击右侧「新建关系」添加
              </text>
            )}
          </svg>

          {/* Legend */}
          <div className="absolute bottom-4 right-4 bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-3 text-[12px]">
            <div className="flex items-center gap-2 py-0.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--accent-gold)' }} />{' '}
              {t('pages.legendProtagonist')}
            </div>
            <div className="flex items-center gap-2 py-0.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--accent-mist)' }} />{' '}
              {t('pages.legendSupporting')}
            </div>
            <div className="flex items-center gap-2 py-0.5">
              <span className="w-5 h-0.5" style={{ background: 'var(--accent-gold)' }} /> {t('pages.legendRelationPos')}
            </div>
            <div className="flex items-center gap-2 py-0.5">
              <span className="w-5 h-0.5" style={{ background: 'var(--accent-ember)' }} />{' '}
              {t('pages.legendRelationNeg')}
            </div>
            <div className="flex items-center gap-2 py-0.5">
              <span className="w-5 h-0.5" style={{ background: 'var(--ink-mute)' }} />{' '}
              {t('pages.legendRelationNeutral')}
            </div>
          </div>
        </div>

        {/* Stats sidebar */}
        <div className="w-[220px] shrink-0 border-l border-[var(--hairline)] p-4 overflow-y-auto custom-scrollbar">
          <div className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-4 mb-4">
            <div className="dash-card-title flex items-center gap-1.5">
              <Users className="w-4 h-4" /> {t('pages.cardCharacters')}
            </div>
            <div className="mt-2">
              {sortedByChapter.slice(0, 8).map((c: any, i) => (
                <div key={`${c.id}-${i}`} className="flex justify-between items-center py-[3px] text-[13px]">
                  <span className="text-[12px] text-[var(--ink-mute)] truncate max-w-[130px]">{c.name}</span>
                  <span className="font-mono text-[12px] text-[var(--ink-tertiary)]">{c.chapterCount || 0}章</span>
                </div>
              ))}
              {chars.length === 0 && (
                <div className="text-[12px] text-[var(--ink-tertiary)] py-2 text-center">暂无数据</div>
              )}
            </div>
          </div>
          <div className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-4">
            <div className="dash-card-title flex items-center gap-1.5">
              <Link2 className="w-4 h-4" /> {t('pages.relationGraph')}
            </div>
            <div className="mt-2">
              {sortedRelTypes.map(([type, count], i) => (
                <div key={`${type}-${i}`} className="flex justify-between items-center py-[3px] text-[13px]">
                  <span className="text-[12px] text-[var(--ink-mute)]">{type}</span>
                  <span className="font-mono text-[12px] text-[var(--ink-tertiary)]">{count}</span>
                </div>
              ))}
              {rels.length === 0 && (
                <div className="text-[12px] text-[var(--ink-tertiary)] py-2 text-center">暂无数据</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
