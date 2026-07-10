import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCards } from './StatCards'
import { SummaryCard } from './SummaryCard'
import { VideoTable } from './VideoTable'
import { BarList } from './BarList'
import type { CacheItem, CacheReport, Distribution } from '@/lib/bili'

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
}: {
  report: CacheReport
  onPlay: (item: CacheItem) => void
}) {
  return (
    // 宽屏(≥xl)：左侧概览 + 右侧缓存清单（两栏等高）；窄屏：上下堆叠（保持原布局）
    <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[460px_minmax(0,1fr)] xl:items-stretch">
      <div className="flex flex-col gap-4">
        <StatCards report={report} />

        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-1">
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

      <div className="min-w-0">
        <VideoTable report={report} onPlay={onPlay} />
      </div>
    </div>
  )
}
