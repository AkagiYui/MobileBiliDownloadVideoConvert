import { useState } from 'react'
import { LayersIcon, PlayIcon, ZapIcon, CrownIcon } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import type { CacheItem, CacheReport } from '@/lib/bili'
import { formatBytes, formatDate, formatDuration, qualityTier } from '@/lib/bili'
import { cn } from '@/lib/utils'

function PlayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="播放"
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-bili-pink/15 hover:text-bili-pink"
    >
      <PlayIcon className="size-3.5 fill-current" />
    </button>
  )
}

function QualityBadge({ code, label }: { code: number; label: string }) {
  const tier = qualityTier(code)
  return (
    <span
      className={cn(
        'inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide',
        tier === 'hd' && 'bg-bili-pink/15 text-bili-pink',
        tier === 'sd' && 'bg-bili-blue/15 text-bili-blue',
        tier === 'low' && 'bg-muted text-muted-foreground',
      )}
    >
      {label}
    </span>
  )
}

/** 充电专属视频标记。 */
function ChargeBadge() {
  return (
    <span className="mr-1.5 inline-flex h-4 items-center gap-0.5 rounded border border-warning/50 px-1 align-middle text-[9px] font-medium text-warning">
      <ZapIcon className="size-2.5" />
      充电
    </span>
  )
}

/** 大会员专享画质标记。 */
function VipBadge() {
  return (
    <span className="mr-1.5 inline-flex h-4 items-center gap-0.5 rounded bg-bili-pink px-1 align-middle text-[9px] font-medium text-white">
      <CrownIcon className="size-2.5" />
      大会员
    </span>
  )
}

const TH = 'h-9 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'

type Filter = 'all' | 'vip' | 'charge'

export function VideoTable({
  report,
  onPlay,
  fill = false,
}: {
  report: CacheReport
  onPlay: (item: CacheItem) => void
  /** 宽屏两栏时填满父容器高度（父容器为概览高度），列表内部滚动、不撑高整行。 */
  fill?: boolean
}) {
  const [filter, setFilter] = useState<Filter>('all')

  // 可用的筛选项：全部 + 存在时才显示的 大会员 / 充电
  const filters: { key: Filter; label: string; icon?: typeof CrownIcon }[] = [
    { key: 'all', label: '全部' },
    ...(report.vipCount > 0 ? [{ key: 'vip' as const, label: '大会员', icon: CrownIcon }] : []),
    ...(report.chargeCount > 0 ? [{ key: 'charge' as const, label: '充电', icon: ZapIcon }] : []),
  ]

  // avid → 该投稿的首个条目，用于「按视频」行的播放
  const firstItemByAvid = new Map<string, CacheItem>()
  for (const it of report.items) {
    if (!firstItemByAvid.has(it.avid)) firstItemByAvid.set(it.avid, it)
  }

  const match = (x: { isVip: boolean; isCharge: boolean }) =>
    filter === 'vip' ? x.isVip : filter === 'charge' ? x.isCharge : true
  const videos = report.videos.filter(match)
  const items = report.items.filter(match)

  return (
    <Card
      className={cn('gap-0 overflow-hidden py-0', fill && 'xl:absolute xl:inset-0 xl:h-auto')}
    >
      <Tabs
        defaultValue="videos"
        className={cn('gap-0', fill && 'xl:flex xl:min-h-0 xl:flex-1 xl:flex-col')}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              缓存清单
            </div>
            {filters.length > 1 && (
              <div className="inline-flex rounded-md bg-muted p-0.5 text-xs">
                {filters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-2 py-0.5 transition-colors',
                      filter === f.key
                        ? cn(
                            'bg-background font-medium shadow-sm',
                            f.key === 'charge' && 'text-warning',
                            f.key === 'vip' && 'text-bili-pink',
                          )
                        : 'text-muted-foreground',
                    )}
                  >
                    {f.icon && <f.icon className="size-3" />}
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <TabsList>
            <TabsTrigger value="videos" className="text-xs">
              按视频 · {videos.length}
            </TabsTrigger>
            <TabsTrigger value="items" className="text-xs">
              按条目 · {items.length}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 按视频（投稿）分组 */}
        <TabsContent
          value="videos"
          className={cn('m-0', fill && 'xl:flex xl:min-h-0 xl:flex-1 xl:flex-col')}
        >
          <div
            className={cn(
              'max-h-[560px] overflow-auto',
              fill && 'xl:max-h-none xl:min-h-0 xl:flex-1',
            )}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className={cn(TH, 'w-9')} />
                  <TableHead className={TH}>缓存日期</TableHead>
                  <TableHead className={TH}>标题</TableHead>
                  <TableHead className={cn(TH, 'hidden sm:table-cell')}>UP 主</TableHead>
                  <TableHead className={TH}>画质</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>大小</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>时长</TableHead>
                  <TableHead className={cn(TH, 'text-center')}>分集</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {videos.map((v) => {
                  const first = firstItemByAvid.get(v.avid)
                  return (
                    <TableRow key={v.avid} className="text-sm">
                      <TableCell className="pr-0">
                        {first && <PlayButton onClick={() => onPlay(first)} />}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {formatDate(v.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate font-medium" title={v.title}>
                        {v.isVip && <VipBadge />}
                        {v.isCharge && <ChargeBadge />}
                        {v.isSeason && (
                          <Badge variant="outline" className="mr-1.5 h-4 px-1 text-[9px]">
                            番剧
                          </Badge>
                        )}
                        {v.title}
                      </TableCell>
                      <TableCell
                        className="hidden max-w-[120px] truncate text-muted-foreground sm:table-cell"
                        title={v.owner}
                      >
                        {v.owner}
                      </TableCell>
                      <TableCell>
                        <QualityBadge code={v.quality} label={v.qualityLabel} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {formatBytes(v.totalBytes)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-xs tabular-nums">
                        {formatDuration(v.totalDurationMs)}
                      </TableCell>
                      <TableCell className="text-center">
                        {v.pages > 1 ? (
                          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                            <LayersIcon className="size-2.5" />
                            {v.pages}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* 按条目（分P/分集） */}
        <TabsContent
          value="items"
          className={cn('m-0', fill && 'xl:flex xl:min-h-0 xl:flex-1 xl:flex-col')}
        >
          <div
            className={cn(
              'max-h-[560px] overflow-auto',
              fill && 'xl:max-h-none xl:min-h-0 xl:flex-1',
            )}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className={cn(TH, 'w-9')} />
                  <TableHead className={TH}>分P</TableHead>
                  <TableHead className={TH}>标题 / 分段</TableHead>
                  <TableHead className={cn(TH, 'hidden sm:table-cell')}>UP 主</TableHead>
                  <TableHead className={TH}>画质</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>大小</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>时长</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>弹幕</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.path} className="text-sm">
                    <TableCell className="pr-0">
                      <PlayButton onClick={() => onPlay(it)} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      P{it.page || '?'}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate" title={it.part || it.title}>
                      {it.isVip && <VipBadge />}
                      {it.isCharge && <ChargeBadge />}
                      {it.part || it.title}
                    </TableCell>
                    <TableCell
                      className="hidden max-w-[120px] truncate text-muted-foreground sm:table-cell"
                      title={it.owner}
                    >
                      {it.owner}
                    </TableCell>
                    <TableCell>
                      <QualityBadge code={it.quality} label={it.qualityLabel} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {formatBytes(it.downloadedBytes)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono text-xs tabular-nums">
                      {formatDuration(it.durationMs)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {it.danmaku || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  )
}
