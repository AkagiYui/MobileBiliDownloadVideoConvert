import {
  UsbIcon,
  SmartphoneIcon,
  FolderSearchIcon,
  Loader2Icon,
  DatabaseIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import type { ScanProgress } from '@/lib/adb'

const STEPS = [
  {
    icon: SmartphoneIcon,
    title: '连接手机',
    desc: '用数据线把手机连到电脑，并在手机「设置 → 开发者选项」里打开 USB 调试',
  },
  { icon: UsbIcon, title: '授权连接', desc: '点击下方按钮，在弹窗里选择你的手机并允许连接' },
  { icon: FolderSearchIcon, title: '生成报告', desc: '自动读取已缓存的视频，在本地生成统计报告' },
]

export function Onboarding({
  supported,
  busy,
  progress,
  packageName,
  onPackageChange,
  onConnect,
  onSample,
}: {
  supported: boolean
  busy: boolean
  progress: ScanProgress | null
  packageName: string
  onPackageChange: (v: string) => void
  onConnect: () => void
  onSample: () => void
}) {
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-12 text-center sm:py-20">
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-[11px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-bili-blue" />
        全部在本地完成 · 不上传任何数据
      </div>
      <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
        分析你的<span className="text-bili-pink">哔哩哔哩</span>离线缓存
      </h1>
      <p className="mt-3 max-w-lg text-pretty text-sm text-muted-foreground sm:text-base">
        连接手机，扫描哔哩哔哩里已缓存（离线下载）的视频，一键生成画质、体积、时长、
        UP 主与弹幕的统计报告；还能在线播放，并把视频、音频、弹幕保存到电脑。
      </p>

      {!supported && (
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-left text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            当前浏览器无法连接手机。请使用电脑版的 <b>Chrome</b> 或 <b>Edge</b> 浏览器。
            你仍可点击「载入示例」预览效果。
          </div>
        </div>
      )}

      {busy ? (
        <div className="mt-8 w-full max-w-md">
          <div className="mb-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            {progress?.phase === 'listing' && '正在查找已缓存的视频…'}
            {progress?.phase === 'reading' && `读取视频信息 ${progress.done}/${progress.total}`}
            {(!progress || progress.phase === 'done') && '正在连接手机…'}
          </div>
          <Progress value={progress?.phase === 'reading' ? pct : null} />
          {progress?.label && (
            <div className="mt-1.5 truncate text-[11px] text-muted-foreground/70">{progress.label}</div>
          )}
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <Button size="lg" onClick={onConnect} disabled={!supported} className="gap-2">
              <UsbIcon className="size-4" />
              连接手机并扫描
            </Button>
            <Button size="lg" variant="outline" onClick={onSample} className="gap-2">
              <DatabaseIcon className="size-4" />
              载入示例
            </Button>
          </div>

          <label className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            目标应用（一般无需修改）
            <Input
              value={packageName}
              onChange={(e) => onPackageChange(e.target.value)}
              spellCheck={false}
              className="h-8 w-56 font-mono text-xs"
            />
          </label>
        </>
      )}

      <div className="mt-12 grid w-full gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.title} className="rounded-xl border bg-card/50 p-4 text-left">
            <div className="mb-2 flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-lg bg-bili-pink/10 text-bili-pink">
                <s.icon className="size-4" />
              </div>
              <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
            </div>
            <div className="text-sm font-medium">{s.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{s.desc}</div>
          </div>
        ))}
      </div>

      <p className="mt-8 text-pretty text-[11px] leading-relaxed text-muted-foreground/70">
        提示：若电脑上有其他手机助手 / 调试工具正占用着这台手机，连接前请先关闭它们，否则可能连不上。
      </p>
    </div>
  )
}
