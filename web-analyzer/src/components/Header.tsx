import { ThemeToggle } from './ThemeToggle'
import type { DeviceInfo } from '@/lib/adb'

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="size-4" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

/** 小电视风格的品牌标记：粉色圆角方块 + 两只“耳朵”。 */
function BiliMark() {
  return (
    <div className="relative grid size-8 place-items-center rounded-[9px] bg-bili-pink text-white shadow-sm">
      <span
        className="absolute -top-1.5 left-1 h-2.5 w-[2px] rotate-[-35deg] rounded-full bg-bili-pink"
        aria-hidden
      />
      <span
        className="absolute -top-1.5 right-1 h-2.5 w-[2px] rotate-[35deg] rounded-full bg-bili-pink"
        aria-hidden
      />
      <div className="flex gap-1">
        <span className="size-1 rounded-full bg-white" />
        <span className="size-1 rounded-full bg-white" />
      </div>
    </div>
  )
}

export function Header({ device }: { device: DeviceInfo | null }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <BiliMark />
        <div className="mr-auto leading-tight">
          <div className="font-semibold tracking-tight">哔哩哔哩缓存分析器</div>
          <div className="text-[11px] text-muted-foreground">离线缓存 · 分析 · 播放 · 导出</div>
        </div>

        {device && (
          <div className="hidden items-center gap-2 rounded-full border bg-card px-3 py-1 sm:flex">
            <span className="size-1.5 rounded-full bg-success" />
            <span className="text-xs font-medium">
              {device.brand ? `${device.brand} ` : ''}
              {device.model || device.name}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">{device.serial}</span>
          </div>
        )}

        <a
          href="https://github.com/AkagiYui/MobileBiliDownloadVideoConvert"
          target="_blank"
          rel="noreferrer"
          className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="项目仓库"
        >
          <GithubMark />
        </a>
        <ThemeToggle />
      </div>
    </header>
  )
}
