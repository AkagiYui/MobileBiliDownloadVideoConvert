import { LayersIcon, PlayIcon } from 'lucide-react'
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

const TH = 'h-9 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'

export function VideoTable({
  report,
  onPlay,
}: {
  report: CacheReport
  onPlay: (item: CacheItem) => void
}) {
  // avid → 该投稿的首个条目，用于「按视频」行的播放
  const firstItemByAvid = new Map<string, CacheItem>()
  for (const it of report.items) {
    if (!firstItemByAvid.has(it.avid)) firstItemByAvid.set(it.avid, it)
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Tabs defaultValue="videos" className="gap-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            缓存清单
          </div>
          <TabsList>
            <TabsTrigger value="videos" className="text-xs">
              按视频 · {report.videoCount}
            </TabsTrigger>
            <TabsTrigger value="items" className="text-xs">
              按条目 · {report.itemCount}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 按视频（投稿）分组 */}
        <TabsContent value="videos" className="m-0">
          <div className="max-h-[560px] overflow-auto">
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
                {report.videos.map((v) => {
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
        <TabsContent value="items" className="m-0">
          <div className="max-h-[560px] overflow-auto">
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
                {report.items.map((it) => (
                  <TableRow key={it.path} className="text-sm">
                    <TableCell className="pr-0">
                      <PlayButton onClick={() => onPlay(it)} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      P{it.page || '?'}
                    </TableCell>
                    <TableCell
                      className="max-w-[280px] truncate"
                      title={it.part || it.title}
                    >
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
