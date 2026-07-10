import {
  RefreshCwIcon,
  XIcon,
  DatabaseIcon,
  HardDriveIcon,
  Loader2Icon,
  PanelRightIcon,
  PanelBottomIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReportLayout } from './Report'

export function Toolbar({
  source,
  packageName,
  itemCount,
  skipped,
  busy,
  layout,
  onToggleLayout,
  onRescan,
  onReset,
}: {
  source: 'device' | 'sample'
  packageName: string
  itemCount: number
  skipped: number
  busy: boolean
  layout: ReportLayout
  onToggleLayout: () => void
  onRescan: () => void
  onReset: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-4 py-2.5">
      <div className="flex items-center gap-2">
        {source === 'sample' ? (
          <DatabaseIcon className="size-4 text-bili-blue" />
        ) : (
          <HardDriveIcon className="size-4 text-bili-pink" />
        )}
        <span className="text-sm font-medium">{source === 'sample' ? '示例数据' : '设备缓存'}</span>
      </div>
      <span className="font-mono text-xs text-muted-foreground">{packageName}</span>
      <span className="text-xs text-muted-foreground">
        · {itemCount} 条目{skipped > 0 && `，跳过 ${skipped}`}
      </span>

      <div className="ml-auto flex items-center gap-2">
        {/* 布局切换：仅宽屏显示（窄屏恒为堆叠）。图标表示切换后的位置 */}
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleLayout}
          aria-label={layout === 'side' ? '清单移到下方' : '清单移到右侧'}
          title={layout === 'side' ? '清单移到下方' : '清单移到右侧'}
          className="hidden size-8 xl:inline-flex"
        >
          {layout === 'side' ? (
            <PanelBottomIcon className="size-4" />
          ) : (
            <PanelRightIcon className="size-4" />
          )}
        </Button>
        {source === 'device' && (
          <Button variant="outline" size="sm" onClick={onRescan} disabled={busy} className="gap-1.5">
            {busy ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-3.5" />
            )}
            重新扫描
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5 text-muted-foreground">
          <XIcon className="size-3.5" />
          {source === 'device' ? '断开' : '返回'}
        </Button>
      </div>
    </div>
  )
}
