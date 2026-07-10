import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCards } from './StatCards'
import { SummaryCard } from './SummaryCard'
import { VideoTable } from './VideoTable'
import { BarList } from './BarList'
import type { CacheItem, CacheReport, Distribution } from '@/lib/bili'
import { cn } from '@/lib/utils'

/** 宽屏下缓存清单的位置：side = 右侧两栏，below = 下方整宽。窄屏恒为堆叠。 */
export type ReportLayout = 'side' | 'below'

function DistributionCard({
  title,
  hint,
  data,
  limit,
  mono,
  renderValue,
}: {
  title: string
  hint?: string
  data: Distribution[]
  limit?: number
  mono?: boolean
  renderValue?: (d: Distribution) => string
}) {
  return (
    <Card className="gap-0">
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
          {hint && <span className="font-mono text-[10px] normal-case">{hint}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <BarList data={data} limit={limit} mono={mono} renderValue={renderValue} />
      </CardContent>
    </Card>
  )
}

export function Report({
  report,
  onPlay,
  layout = 'side',
}: {
  report: CacheReport
  onPlay: (item: CacheItem) => void
  layout?: ReportLayout
}) {
  const side = layout === 'side'
  return (
    // side（宽屏）：左侧概览 + 右侧清单，两栏等高（清单绝对填充、不撑高整行）
    // below / 窄屏：概览在上、清单整宽在下
    <div
      className={cn(
        'flex flex-col gap-4',
        side && 'xl:grid xl:grid-cols-[460px_minmax(0,1fr)] xl:items-stretch',
      )}
    >
      <div className="flex flex-col gap-4">
        <StatCards report={report} dense={side} />

        <div className={cn('grid gap-3 lg:grid-cols-3', side && 'xl:grid-cols-1')}>
          <DistributionCard
            title="画质分布"
            hint={`众数 ${report.qualities[0]?.label ?? '—'}`}
            data={report.qualities}
            mono
          />
          <DistributionCard
            title="UP 主分布"
            hint={`${report.owners.length} 位`}
            data={report.owners}
            limit={6}
          />
          <SummaryCard report={report} />
        </div>

        {report.resolutions.length > 0 && (
          <DistributionCard
            title="分辨率分布"
            hint={`${report.resolutions.length} 种`}
            data={report.resolutions}
            limit={8}
          />
        )}
      </div>

      <div className={cn('min-w-0', side && 'xl:relative')}>
        <VideoTable report={report} onPlay={onPlay} fill={side} />
      </div>
    </div>
  )
}
