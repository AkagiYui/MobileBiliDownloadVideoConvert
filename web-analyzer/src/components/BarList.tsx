import type { Distribution } from '@/lib/bili'
import { cn } from '@/lib/utils'

const BAR_COLORS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5']

interface BarListProps {
  data: Distribution[]
  /** 最多展示多少行，其余归入“其他”。 */
  limit?: number
  /** 单色模式：所有条形用同一色（默认按序取 5 色梯）。 */
  mono?: boolean
  /** 右侧数值的后缀渲染，默认展示 count。 */
  renderValue?: (d: Distribution) => string
}

export function BarList({ data, limit, mono, renderValue }: BarListProps) {
  let rows = data
  let overflow: Distribution | null = null
  if (limit && data.length > limit) {
    rows = data.slice(0, limit)
    const rest = data.slice(limit)
    overflow = {
      label: '其他',
      count: rest.reduce((s, d) => s + d.count, 0),
      weight: rest.reduce((s, d) => s + (d.weight ?? 0), 0),
    }
  }
  const max = Math.max(1, ...data.map((d) => d.count))
  const all = overflow ? [...rows, overflow] : rows

  return (
    <div className="flex flex-col gap-2.5">
      {all.map((d, i) => {
        const isOverflow = overflow !== null && i === all.length - 1
        const color = isOverflow ? 'bg-muted-foreground/40' : mono ? 'bg-bili-pink' : BAR_COLORS[i % 5]
        return (
          <div key={d.label} className="flex items-center gap-3">
            <div className="w-20 shrink-0 truncate text-xs text-foreground/80" title={d.label}>
              {d.label}
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-[width] duration-700 ease-out', color)}
                style={{ width: `${Math.max(2, (d.count / max) * 100)}%` }}
              />
            </div>
            <div className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {renderValue ? renderValue(d) : d.count}
            </div>
          </div>
        )
      })}
    </div>
  )
}
