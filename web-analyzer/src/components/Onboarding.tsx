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
  { icon: SmartphoneIcon, title: '开启 USB 调试', desc: '手机「开发者选项」→ 打开 USB 调试，插上数据线' },
  { icon: UsbIcon, title: '浏览器授权', desc: '点击下方按钮，在弹窗中选择你的设备并允许调试' },
  { icon: FolderSearchIcon, title: '扫描并分析', desc: '自动读取缓存目录下的 entry.json，本地生成报告' },
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
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 font-mono text-[11px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-bili-blue" />
        WebUSB · 数据不离开本机
      </div>
      <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
        在浏览器里分析
        <span className="text-bili-pink">哔哩哔哩</span>缓存
      </h1>
      <p className="mt-3 max-w-lg text-pretty text-sm text-muted-foreground sm:text-base">
        插上手机、浏览器直连 ADB，扫描已缓存视频的
        <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">entry.json</code>，
        一键生成画质、体积、时长、UP 主与弹幕的可视化报告。全程在本地完成，不上传任何数据。
      </p>

      {!supported && (
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-left text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            当前浏览器不支持 WebUSB。请使用桌面版 <b>Chrome / Edge</b> 等 Chromium 内核浏览器，
            并通过 <span className="font-mono text-xs">https</span> 或 localhost 访问。
            你仍可点击「载入示例」预览报告效果。
          </div>
        </div>
      )}

      {busy ? (
        <div className="mt-8 w-full max-w-md">
          <div className="mb-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            {progress?.phase === 'listing' && '正在枚举缓存目录…'}
            {progress?.phase === 'reading' && `读取缓存信息 ${progress.done}/${progress.total}`}
            {(!progress || progress.phase === 'done') && '连接与握手中…'}
          </div>
          <Progress value={progress?.phase === 'reading' ? pct : null} />
          {progress?.label && (
            <div className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground/70">
              {progress.label}
            </div>
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
            应用包名
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
        提示：连接前请关闭电脑上占用设备的 adb server（<code className="font-mono">adb kill-server</code>），
        否则 WebUSB 无法独占该设备。技术基于开源项目 ya-webadb (Tango)。
      </p>
    </div>
  )
}
