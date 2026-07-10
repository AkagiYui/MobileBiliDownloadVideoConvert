import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { CacheReport } from '@/lib/bili'
import { formatBytes, formatDate, formatLongDuration, spanDescription } from '@/lib/bili'

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-none">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

export function SummaryCard({ report }: { report: CacheReport }) {
  const span = spanDescription(report.earliest, report.latest)
  return (
    <Card className="gap-0">
      <CardHeader>
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          概要
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Row k="视频格式">
          {report.legacyCount === 0 ? (
            <Badge variant="secondary" className="bg-success/15 text-success">
              新版
            </Badge>
          ) : (
            <span className="text-xs">
              新版 {report.dashCount} · 旧版 {report.legacyCount}
            </span>
          )}
        </Row>
        <Row k="完成率">
          <Badge variant="secondary" className="bg-success/15 font-mono text-success">
            {Math.round((report.completedCount / Math.max(1, report.itemCount)) * 100)}% ·{' '}
            {report.completedCount}/{report.itemCount}
          </Badge>
        </Row>
        <Row k="付费视频">
          {report.chargeCount > 0 ? (
            <Badge variant="secondary" className="bg-warning/15 text-warning">
              {report.chargeCount} 个
            </Badge>
          ) : (
            <span className="text-muted-foreground">无</span>
          )}
        </Row>
        <Row k="最长单片">{formatLongDuration(report.maxDurationMs)}</Row>
        <Row k="最短单片">{formatLongDuration(report.minDurationMs)}</Row>
        <Row k="理论总量">
          <span className="font-mono">{formatBytes(report.totalBytes)}</span>
        </Row>

        <div className="mt-4">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            缓存时间跨度
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {formatDate(report.earliest)}
            </span>
            <div className="relative h-1 flex-1 rounded-full bg-muted">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-bili-pink to-bili-blue" />
              <span className="absolute left-0 top-1/2 size-2 -translate-y-1/2 rounded-full border-2 border-background bg-bili-pink" />
              <span className="absolute right-0 top-1/2 size-2 -translate-y-1/2 rounded-full border-2 border-background bg-bili-blue" />
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              {formatDate(report.latest)}
            </span>
          </div>
          <div className="mt-1 text-center text-[11px] text-muted-foreground">{span}</div>
        </div>
      </CardContent>
    </Card>
  )
}
