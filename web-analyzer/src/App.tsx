import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Header } from '@/components/Header'
import { Onboarding } from '@/components/Onboarding'
import { Toolbar } from '@/components/Toolbar'
import { Report, type ReportLayout } from '@/components/Report'
import { AppContext } from '@/store'
import {
  connect,
  isWebUsbSupported,
  scanCache,
  type Connection,
  type DeviceInfo,
  type ScanProgress,
} from '@/lib/adb'
import { aggregate, parseEntry, type CacheItem, type CacheReport, type RawEntry } from '@/lib/bili'

// 播放器（连同 Artplayer / mp4box）作为独立路由页，按需加载
const PlayerPage = lazy(() => import('@/pages/PlayerPage'))

type Source = 'device' | 'sample'
const DEFAULT_PACKAGE = 'tv.danmaku.bilj'

export default function App() {
  return (
    <HashRouter>
      <AppInner />
    </HashRouter>
  )
}

function AppInner() {
  const navigate = useNavigate()
  const supported = useMemo(() => isWebUsbSupported(), [])
  const [packageName, setPackageName] = useState(DEFAULT_PACKAGE)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [report, setReport] = useState<CacheReport | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const [busy, setBusy] = useState(false)
  const [layout, setLayout] = useState<ReportLayout>('side')
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [skipped, setSkipped] = useState(0)

  // 打开播放器路由：把同一投稿(avid)的所有分P作为选集，定位到点击的那一集
  const openPlayer = useCallback(
    (item: CacheItem) => {
      if (!report) return
      const items = report.items.filter((i) => i.avid === item.avid)
      const idx = Math.max(
        0,
        items.findIndex((i) => i.path === item.path),
      )
      navigate(`/play/${encodeURIComponent(item.avid)}?i=${idx}`)
    },
    [report, navigate],
  )

  const runScan = useCallback(async (conn: Connection, pkg: string) => {
    setBusy(true)
    setProgress(null)
    try {
      const result = await scanCache(conn.adb, pkg, setProgress)
      if (result.items.length === 0) {
        toast.error('没有找到缓存视频', {
          description: '请确认这台手机的哔哩哔哩里已经离线缓存过视频。',
        })
        return
      }
      setReport(aggregate(result.items))
      setSkipped(result.skipped)
      setSource('device')
      toast.success(`已分析 ${result.items.length} 个缓存条目`, {
        description: result.skipped > 0 ? `另有 ${result.skipped} 项无法读取，已跳过` : undefined,
      })
    } catch (err) {
      toast.error('扫描失败', { description: (err as Error).message })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }, [])

  const handleConnect = useCallback(async () => {
    if (!supported) return
    setBusy(true)
    let conn: Connection | null = null
    try {
      conn = await connect()
    } catch (err) {
      toast.error('连接失败', { description: (err as Error).message })
      setBusy(false)
      return
    }
    if (!conn) {
      setBusy(false)
      return
    }
    setConnection(conn)
    setDevice(conn.device)
    await runScan(conn, packageName)
  }, [supported, packageName, runScan])

  const handleRescan = useCallback(() => {
    if (connection) void runScan(connection, packageName)
  }, [connection, packageName, runScan])

  const handleSample = useCallback(async () => {
    setBusy(true)
    setProgress({ phase: 'reading', done: 0, total: 1, label: 'sample-items.json' })
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sample-items.json`)
      if (!res.ok) throw new Error(`加载示例失败 (HTTP ${res.status})`)
      const raw = (await res.json()) as unknown[]
      const items: CacheItem[] = raw.map((x, i) =>
        'qualityLabel' in (x as object) ? (x as CacheItem) : parseEntry(x as RawEntry, `sample/${i}`),
      )
      setReport(aggregate(items))
      setSkipped(0)
      setDevice(null)
      setSource('sample')
      toast.success(`已载入示例：${items.length} 个条目`)
    } catch (err) {
      toast.error('载入示例失败', { description: (err as Error).message })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }, [])

  const handleReset = useCallback(async () => {
    if (connection) {
      try {
        await connection.close()
      } catch {
        /* 忽略关闭异常 */
      }
    }
    setConnection(null)
    setDevice(null)
    setReport(null)
    setSource(null)
    setSkipped(0)
  }, [connection])

  const store = useMemo(
    () => ({ report, source, connection, packageName }),
    [report, source, connection, packageName],
  )

  const analyzer =
    report && source ? (
      <div className="flex flex-col gap-4">
        <Toolbar
          source={source}
          packageName={source === 'sample' ? '示例 · tv.danmaku.bilj' : packageName}
          itemCount={report.itemCount}
          skipped={skipped}
          busy={busy}
          layout={layout}
          onToggleLayout={() => setLayout((l) => (l === 'side' ? 'below' : 'side'))}
          onRescan={handleRescan}
          onReset={handleReset}
        />
        <Report report={report} onPlay={openPlayer} layout={layout} />
      </div>
    ) : (
      <Onboarding
        supported={supported}
        busy={busy}
        progress={progress}
        packageName={packageName}
        onPackageChange={setPackageName}
        onConnect={handleConnect}
        onSample={handleSample}
      />
    )

  return (
    <AppContext.Provider value={store}>
      <div className="min-h-svh bg-background">
        <Header device={device} />
        <Routes>
          <Route
            path="/"
            element={<main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{analyzer}</main>}
          />
          <Route
            path="/play/:avid"
            element={
              <Suspense
                fallback={<div className="py-24 text-center text-sm text-muted-foreground">加载播放器…</div>}
              >
                <PlayerPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <footer className="mx-auto max-w-6xl px-6 pb-10 pt-4 text-center text-[11px] text-muted-foreground/60">
          全部在本地完成 · 不上传任何数据
        </footer>
      </div>
    </AppContext.Provider>
  )
}
