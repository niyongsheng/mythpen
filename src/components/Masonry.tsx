import { type ReactNode, useLayoutEffect, useReducer, useRef, useState } from 'react'

interface MasonryProps<T> {
  items: T[]
  /** Minimum column width in px; the column count follows the container width. */
  minColumnWidth: number
  /** Gap between columns and between cards in px. */
  gap?: number
  className?: string
  renderItem: (item: T, index: number) => ReactNode
}

/**
 * Masonry packed from the top-left: cards keep their order across the first
 * row, and every following card goes into the shortest column (leftmost on
 * ties). CSS `columns` balances into column-major order instead, which can
 * leave the rightmost column empty while early cards stack down column one.
 *
 * Card heights are measured after render and the distribution is applied in a
 * layout effect, so the intermediate (single column) layout never reaches the
 * screen. Column widths are equal, so moving a card between columns does not
 * change its height.
 */
export function Masonry<T>({ items, minColumnWidth, gap = 12, className = '', renderItem }: MasonryProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  // Bumped whenever the container resizes; forces a rebalance pass even when
  // the width itself is unchanged (e.g. the page becomes visible again).
  const [, rebuild] = useReducer((tick: number) => tick + 1, 0)
  const [columns, setColumns] = useState<number[][]>(() => [items.map((_, index) => index)])

  const columnCount = width > 0 ? Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap))) : 1

  // Track the container width: it decides the column count and card widths.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const next = el.clientWidth
      if (next > 0) setWidth(next)
      rebuild()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Runs after every render; no dependency list on purpose. Measuring happens
  // before paint, and the equality check below stops the loop once stable.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el || el.clientWidth === 0 || items.length === 0) return

    const heights: number[] = new Array(items.length).fill(0)
    for (const node of el.querySelectorAll<HTMLElement>('[data-masonry-index]')) {
      const index = Number(node.dataset.masonryIndex)
      if (Number.isInteger(index) && index >= 0 && index < heights.length) heights[index] = node.offsetHeight
    }

    const next: number[][] = Array.from({ length: columnCount }, () => [])
    const totals: number[] = new Array(columnCount).fill(0)
    for (let index = 0; index < items.length; index++) {
      let target = 0
      for (let column = 1; column < columnCount; column++) {
        if (totals[column] < totals[target]) target = column
      }
      next[target].push(index)
      totals[target] += (heights[index] || 0) + gap
    }

    setColumns((prev) => (isSameLayout(prev, next) ? prev : next))
  })

  return (
    <div ref={containerRef} className={`flex items-start ${className}`} style={{ gap }}>
      {columns.map((column, columnIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional and never reordered
        <div key={`column-${columnIndex}`} className="min-w-0 flex-1 flex flex-col" style={{ gap }}>
          {column.map((index) =>
            index < items.length ? (
              <div key={`item-${index}`} className="min-w-0" data-masonry-index={index}>
                {renderItem(items[index], index)}
              </div>
            ) : null,
          )}
        </div>
      ))}
    </div>
  )
}

function isSameLayout(a: number[][], b: number[][]): boolean {
  if (a.length !== b.length) return false
  for (let column = 0; column < a.length; column++) {
    if (a[column].length !== b[column].length) return false
    for (let row = 0; row < a[column].length; row++) {
      if (a[column][row] !== b[column][row]) return false
    }
  }
  return true
}
