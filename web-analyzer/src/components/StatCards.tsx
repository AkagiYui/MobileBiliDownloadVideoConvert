import type { LucideIcon } from 'lucide-react'
import { HardDriveIcon, ClockIcon, MessageSquareIcon, FilmIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { CacheReport } from '@/lib/bili'
import { formatBytes, formatLongDuration } from '@/lib/bili'
import { cn } from '@/lib/utils'

function StatCard({
  icon: Icon,
  value,
  unit,
  label,
  sub,
}: {
  icon: LucideIcon
  value: string
  unit?: string
  label: string
  sub: string
}) {
  return (
    <Card className="relative gap-0 overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-bili-pink/70" />
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="flex items-baseline gap-1 font-mono tabular-nums">
        <span className="text-3xl font-semibold leading-none tracking-tight text-bili-pink">
          {value}
        </span>
        {unit && <span className="text-base font-medium text-bili-pink/80">{unit}</span>}
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>
    </Card>
  )
}

export function StatCards({ report, dense = false }: { report: CacheReport; dense?: boolean }) {
  const dur = formatLongDuration(report.totalDurationMs)
  const [durMain, durUnit] = dur.includes('h') ? [dur, ''] : [dur.split(' ')[0], dur.split(' ')[1] ?? '']
  const size = formatBytes(report.downloadedBytes)

  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', dense && 'xl:grid-cols-2')}>
      <StatCard
        icon={FilmIcon}
        value={String(report.itemCount)}
        label="缓存条目"
        sub={`${report.videoCount} 部独立视频`}
      />
      <StatCard
        icon={HardDriveIcon}
        value={size.split(' ')[0]}
        unit={size.split(' ')[1]}
        label="已下载"
        sub={report.incompleteCount === 0 ? '全部下载完成' : `${report.incompleteCount} 项未完成`}
      />
      <StatCard
        icon={ClockIcon}
        value={durMain}
        unit={durUnit}
        label="总时长"
        sub={`均长 ${formatLongDuration(report.avgDurationMs)}`}
      />
      <StatCard
        icon={MessageSquareIcon}
        value={report.danmakuTotal.toLocaleString('en-US')}
        label="弹幕总数"
        sub={`${report.itemsWithDanmaku} / ${report.itemCount} 条目含弹幕`}
      />
    </div>
  )
}
