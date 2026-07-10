import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Artplayer from 'artplayer'
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku'
import { toast } from 'sonner'
import {
  Loader2Icon,
  TriangleAlertIcon,
  FileVideoIcon,
  FileAudioIcon,
  FilmIcon,
  DownloadIcon,
  ListVideoIcon,
  ArrowLeftIcon,
  MessageSquareIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  attachDualStreamStreaming,
  parseDanmaku,
  UnsupportedCodecError,
  type ByteStream,
  type DualStreamHandle,
} from '@/lib/media'
import { exportMuxed, loadFfmpeg, type ExportMeta } from '@/lib/ffmpeg'
import { downloadBytes, safeFilename, saveStreamed, type StreamSource } from '@/lib/download'
import { formatBytes, formatDuration, type CacheItem } from '@/lib/bili'
import type { Connection } from '@/lib/adb'
import { openMediaFile, openMediaStreams, readMedia } from '@/lib/adb'
import { cn } from '@/lib/utils'

type ExportKind = 'video' | 'audio' | 'mux'

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

export function PlayerView({
  playlist,
  startIndex,
  source,
  connection,
  packageName,
  onBack,
}: {
  playlist: CacheItem[]
  startIndex: number
  source: 'device' | 'sample'
  connection: Connection | null
  packageName: string
  onBack: () => void
}) {
  const [index, setIndex] = useState(startIndex)
  const item = playlist[index] ?? playlist[0] ?? null
  const multi = playlist.length > 1

  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const artRef = useRef<Artplayer | null>(null)

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadNote, setLoadNote] = useState('加载中…')
  const [errorMsg, setErrorMsg] = useState('')
  const [playbackWarning, setPlaybackWarning] = useState('')
  const [exporting, setExporting] = useState<ExportKind | null>(null)
  const [exportRatio, setExportRatio] = useState(0)
  const [exportNote, setExportNote] = useState('')
  const [danmakuXml, setDanmakuXml] = useState('')

  useEffect(() => setIndex(startIndex), [startIndex, playlist])

  // 打开流并初始化播放器（流式，不整段读入内存）
  useEffect(() => {
    if (!item || !container) return
    let cancelled = false
    let art: Artplayer | null = null
    let handle: DualStreamHandle | null = null
    let dispose: (() => Promise<void>) | null = null

    setPhase('loading')
    setLoadNote('加载中…')
    setErrorMsg('')
    setPlaybackWarning('')
    setDanmakuXml('')

    const run = async () => {
      if (!item.isDash) {
        throw new Error('这个视频是旧格式，暂不支持在线播放。')
      }
      let videoStream: ByteStream
      let audioStream: ByteStream
      let danmakuText = ''

      if (source === 'sample') {
        const base = `${import.meta.env.BASE_URL}demo/`
        const [vr, ar, dr] = await Promise.all([
          fetch(`${base}video.m4s`),
          fetch(`${base}audio.m4s`),
          fetch(`${base}danmaku.xml`).then((r) => r.text()),
        ])
        if (!vr.body || !ar.body) throw new Error('示例媒体加载失败')
        videoStream = vr.body as unknown as ByteStream
        audioStream = ar.body as unknown as ByteStream
        danmakuText = dr
      } else {
        if (!connection) throw new Error('设备连接已断开，请返回重新扫描。')
        const bundle = await openMediaStreams(connection.adb, packageName, item)
        videoStream = bundle.video
        audioStream = bundle.audio
        danmakuText = bundle.danmaku ?? ''
        dispose = bundle.dispose
      }
      if (cancelled) {
        await dispose?.()
        return
      }

      setDanmakuXml(danmakuText)
      const danmakuItems = danmakuText ? parseDanmaku(danmakuText) : []

      art = new Artplayer({
        container,
        url: 'stream',
        type: 'mse',
        volume: 0.7,
        autoplay: false,
        pip: true,
        setting: true,
        playbackRate: true,
        fullscreen: true,
        miniProgressBar: true,
        theme: '#FB7299',
        customType: {
          mse: async (videoEl: HTMLVideoElement) => {
            try {
              handle = await attachDualStreamStreaming(videoEl, videoStream, audioStream)
              if (cancelled) handle.destroy()
            } catch (err) {
              if (err instanceof UnsupportedCodecError) {
                setPlaybackWarning(
                  '当前设备无法播放这个视频的画面格式，但仍可下载到本地，用其他播放器观看。',
                )
              } else {
                setPlaybackWarning(`无法播放：${(err as Error).message}`)
              }
              setPhase('ready')
            }
          },
        },
        plugins:
          danmakuItems.length > 0
            ? [
                artplayerPluginDanmuku({
                  danmuku: danmakuItems,
                  speed: 6,
                  opacity: 1,
                  fontSize: 22,
                  margin: [10, '25%'],
                  emitter: false, // 关闭发弹幕输入框，仅保留显示开关与设置
                }),
              ]
            : [],
      })
      art.on('ready', () => !cancelled && setPhase('ready'))
      art.on('video:canplay', () => !cancelled && setPhase('ready'))
      artRef.current = art
    }

    run().catch((err) => {
      if (!cancelled) {
        setErrorMsg((err as Error).message)
        setPhase('error')
      }
    })

    return () => {
      cancelled = true
      handle?.destroy()
      art?.destroy(true)
      artRef.current = null
      void dispose?.()
    }
  }, [item, container, source, connection, packageName])

  // 文件名/标题基名：多P视频带上 P序号避免重名；单P带上分段名（若与标题不同）
  const baseName = useCallback(() => {
    if (!item) return '视频'
    let name = item.title
    if (multi) name += ` P${item.page}`
    else if (item.part && item.part !== item.title) name += ` ${item.part}`
    return name
  }, [item, multi])

  const meta = useCallback(
    (): ExportMeta => ({
      title: baseName(),
      artist: item?.owner ?? '',
      comment: item?.bvid || `av${item?.avid ?? ''}`,
      date: item?.createdAt ? String(new Date(item.createdAt).getFullYear()) : undefined,
    }),
    [item, baseName],
  )

  // 完整视频（混流）：需整段读入内存交给 ffmpeg 合成，超大文件受内存限制
  const runMux = useCallback(async () => {
    if (!item) return
    setExporting('mux')
    setExportRatio(0)
    setExportNote('')
    const tid = toast.loading('读取媒体并合成…')
    try {
      let video: Uint8Array
      let audio: Uint8Array
      let cover: Uint8Array | undefined
      if (source === 'sample') {
        const b = `${import.meta.env.BASE_URL}demo/`
        ;[video, audio, cover] = await Promise.all([
          fetchBytes(`${b}video.m4s`),
          fetchBytes(`${b}audio.m4s`),
          fetchBytes(`${b}cover.jpg`).catch(() => undefined),
        ])
      } else {
        if (!connection) throw new Error('设备连接已断开')
        const bundle = await readMedia(connection.adb, packageName, item, (s, n) =>
          setExportNote(`读取${s === 'video' ? '视频' : '音频'} ${formatBytes(n)}`),
        )
        video = bundle.video
        audio = bundle.audio
        cover = item.cover ? await fetchBytes(item.cover).catch(() => undefined) : undefined
      }
      const totalMb = (video.length + audio.length) / 1e6
      if (totalMb > 700) {
        toast.warning('文件较大，合成可能因内存不足失败', {
          description: `约 ${totalMb.toFixed(0)} MB，可改用「仅画面 / 仅音频」流式保存。`,
        })
      }
      setExportNote('')
      await loadFfmpeg()
      const out = await exportMuxed(video, audio, meta(), cover, (p) => setExportRatio(p.ratio))
      downloadBytes(out, `${safeFilename(baseName())}.mp4`, 'video/mp4')
      toast.success('已导出到本地', { id: tid })
    } catch (err) {
      toast.error('导出失败', { id: tid, description: (err as Error).message })
    } finally {
      setExporting(null)
      setExportRatio(0)
      setExportNote('')
    }
  }, [item, source, connection, packageName, meta, baseName])

  // 仅画面 / 仅音频：请求浏览器保存，再从手机边拉边写磁盘，内存不驻留整段
  const runStreamSave = useCallback(
    async (kind: 'video' | 'audio') => {
      if (!item) return
      setExporting(kind)
      setExportNote('')
      const name = safeFilename(baseName())
      const filename = kind === 'video' ? `${name}.画面.mp4` : `${name}.音频.m4a`
      const mime = kind === 'video' ? 'video/mp4' : 'audio/mp4'
      const open = async (): Promise<StreamSource> => {
        if (source === 'sample') {
          const res = await fetch(`${import.meta.env.BASE_URL}demo/${kind}.m4s`)
          if (!res.body) throw new Error('示例媒体加载失败')
          return { stream: res.body as unknown as ByteStream }
        }
        if (!connection) throw new Error('设备连接已断开')
        return openMediaFile(connection.adb, packageName, item, kind)
      }
      try {
        const result = await saveStreamed(filename, mime, open, (b) =>
          setExportNote(`已保存 ${formatBytes(b)}`),
        )
        if (result === 'saved') toast.success('已保存到本地')
      } catch (err) {
        toast.error('保存失败', { description: (err as Error).message })
      } finally {
        setExporting(null)
        setExportNote('')
      }
    },
    [item, source, connection, packageName, baseName],
  )

  const downloadDanmaku = useCallback(() => {
    if (!danmakuXml || !item) return
    downloadBytes(
      new TextEncoder().encode(danmakuXml),
      `${safeFilename(baseName())}.弹幕.xml`,
      'application/xml',
    )
    toast.success('已保存弹幕文件')
  }, [danmakuXml, item, baseName])

  const busyExport = exporting !== null

  const episodeName = useMemo(
    () => (it: CacheItem) => (it.part && it.part !== it.title ? it.part : it.title),
    [],
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* 头部：返回 + 标题 */}
      <div className="mb-4 flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="mt-0.5 shrink-0 gap-1.5">
          <ArrowLeftIcon className="size-4" />
          返回
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight" title={item?.title}>
            {item?.title ?? '播放'}
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{item?.owner}</span>
            {item?.qualityLabel && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{item.qualityLabel}</span>
            )}
            {item?.bvid && <span className="font-mono">{item.bvid}</span>}
            {multi && (
              <span className="rounded bg-muted px-1.5 py-0.5">
                P{item?.page} / {playlist.length}
              </span>
            )}
            {source === 'sample' && (
              <span className="rounded bg-bili-blue/15 px-1.5 py-0.5 text-bili-blue">示例媒体</span>
            )}
          </div>
        </div>
      </div>

      <div className={cn('flex flex-col gap-4', multi && 'lg:flex-row')}>
        {/* 播放器 */}
        <div className="min-w-0 flex-1">
          <div className="relative aspect-video max-h-[70vh] w-full overflow-hidden rounded-xl bg-black">
            {phase === 'loading' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-sm text-white/80">
                <Loader2Icon className="size-6 animate-spin" />
                {loadNote}
              </div>
            )}
            {phase === 'error' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/80">
                <TriangleAlertIcon className="size-6 text-warning" />
                {errorMsg}
              </div>
            )}
            <div ref={setContainer} className="art-shell size-full" />
          </div>
        </div>

        {/* 分P / 分集选集 */}
        {multi && (
          <div className="flex flex-col lg:w-60">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ListVideoIcon className="size-3.5" />
              选集 · {playlist.length}
            </div>
            <div className="grid max-h-[62vh] grid-cols-6 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-8 lg:grid-cols-4">
              {playlist.map((it, i) => (
                <button
                  key={it.path}
                  type="button"
                  onClick={() => setIndex(i)}
                  title={episodeName(it)}
                  className={cn(
                    'flex h-9 items-center justify-center rounded-md border px-1 font-mono text-xs transition-colors',
                    i === index
                      ? 'border-bili-pink bg-bili-pink/15 font-semibold text-bili-pink'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {it.page ? `P${it.page}` : i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {playbackWarning && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
          {playbackWarning}
        </div>
      )}

      {/* 保存到本地 */}
      <div className="mt-5 flex flex-col gap-2 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <DownloadIcon className="size-3.5" />
          保存到本地
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button
            variant="outline"
            disabled={!item || busyExport}
            onClick={runMux}
            className="justify-start gap-2"
          >
            {exporting === 'mux' ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <FilmIcon className="size-4 text-bili-pink" />
            )}
            完整视频
          </Button>
          <Button
            variant="outline"
            disabled={!item || busyExport}
            onClick={() => runStreamSave('video')}
            className="justify-start gap-2"
          >
            {exporting === 'video' ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <FileVideoIcon className="size-4" />
            )}
            仅画面
          </Button>
          <Button
            variant="outline"
            disabled={!item || busyExport}
            onClick={() => runStreamSave('audio')}
            className="justify-start gap-2"
          >
            {exporting === 'audio' ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <FileAudioIcon className="size-4" />
            )}
            仅音频
          </Button>
          <Button
            variant="outline"
            disabled={!danmakuXml || busyExport}
            onClick={downloadDanmaku}
            className="justify-start gap-2"
            title={danmakuXml ? undefined : '这个视频没有弹幕'}
          >
            <MessageSquareIcon className="size-4 text-bili-blue" />
            弹幕
          </Button>
        </div>
        {busyExport &&
          (exporting === 'mux' ? (
            <div className="flex flex-col gap-1">
              <Progress value={exportRatio > 0 ? exportRatio * 100 : null} />
              {exportNote && <div className="text-xs text-muted-foreground">{exportNote}</div>}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">{exportNote || '准备保存…'}</div>
          ))}
        <p className="text-[11px] text-muted-foreground/70">
          「完整视频」合成音画并写入标题 / UP 主 / 封面，需读入内存，超大文件可能失败；
          「仅画面 / 仅音频」边拉边存到磁盘，可保存超大文件。时长{' '}
          {item ? formatDuration(item.durationMs) : '—'}。
        </p>
      </div>
    </div>
  )
}
