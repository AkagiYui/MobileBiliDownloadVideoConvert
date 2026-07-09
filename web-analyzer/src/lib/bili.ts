/**
 * Bilibili 离线缓存的领域逻辑：解析 entry.json、聚合统计。
 *
 * 这一层是纯函数，不依赖 ADB / DOM，可独立测试。
 * 参考桌面版脚本 main.py 的缓存目录结构：
 *   download/<avid>/<c_cid | ep_id>/entry.json
 *   download/<avid>/<...>/<type_tag>/{video.m4s, audio.m4s}   (DASH，新版)
 *   download/<avid>/<...>/<type_tag>/{0.blv, 1.blv, ...}       (FLV，旧版)
 */

/** entry.json 里我们关心的字段（其余字段忽略，保持向前兼容）。 */
export interface RawEntry {
  media_type?: number
  has_dash_audio?: boolean
  is_completed?: boolean
  total_bytes?: number
  downloaded_bytes?: number
  title?: string
  type_tag?: string
  cover?: string
  video_quality?: number
  prefered_video_quality?: number
  total_time_milli?: number
  danmaku_count?: number
  time_create_stamp?: number
  time_update_stamp?: number
  quality_pithy_description?: string
  cache_version_code?: number
  avid?: number
  bvid?: string
  owner_id?: number
  owner_name?: string
  owner_avatar?: string
  is_charge_video?: boolean
  season_id?: number
  page_data?: {
    cid?: number
    page?: number
    part?: string
    from?: string
    width?: number
    height?: number
  }
  // 番剧字段
  ep?: { index?: string; av_id?: number; bvid?: string; title?: string }
  source?: { cid?: number }
}

/** 一个规整化后的缓存条目（一个分P / 一集）。 */
export interface CacheItem {
  /** 源目录相对路径，形如 <avid>/<sub>，用作稳定 key。 */
  path: string
  avid: string
  bvid: string
  cid: number
  title: string
  part: string
  page: string
  owner: string
  ownerId: number
  /** 媒体文件所在子目录名（entry.json 的 type_tag），如 "64" 或 "lua.flv.bili2api.80"。 */
  typeTag: string
  /** 封面图 URL。 */
  cover: string
  quality: number
  qualityLabel: string
  width: number
  height: number
  durationMs: number
  danmaku: number
  totalBytes: number
  downloadedBytes: number
  completed: boolean
  isDash: boolean
  isCharge: boolean
  isSeason: boolean
  createdAt: number
  mediaType: number
  cacheVersion: number
}

/** B站清晰度 code → 文字标签（与 App 侧 quality 一致）。 */
const QUALITY_MAP: Record<number, string> = {
  6: '240P',
  16: '360P',
  32: '480P',
  64: '720P',
  74: '720P60',
  80: '1080P',
  112: '1080P+',
  116: '1080P60',
  120: '4K',
  125: 'HDR',
  126: '杜比视界',
  127: '8K',
}

export function qualityLabel(code: number, fallback?: string): string {
  return QUALITY_MAP[code] ?? (fallback && fallback.length > 0 ? fallback : `q${code}`)
}

/** 清晰度分档：hd = 1080P 及以上，sd = 720P，low = 更低。用于徽章配色。 */
export function qualityTier(code: number): 'hd' | 'sd' | 'low' {
  if (code >= 80) return 'hd'
  if (code >= 64) return 'sd'
  return 'low'
}

const MEDIA_TYPE_MAP: Record<number, string> = {
  1: '普通视频(旧)',
  2: '普通视频',
  3: '番剧/影视',
}

export function mediaTypeLabel(code: number): string {
  return MEDIA_TYPE_MAP[code] ?? `type${code}`
}

/**
 * 把一份 entry.json 规整成 CacheItem。
 * @param raw 已解析的 JSON 对象
 * @param path 该条目在 download 下的相对路径（<avid>/<sub>）
 */
export function parseEntry(raw: RawEntry, path: string): CacheItem {
  const isSeason = typeof raw.season_id === 'number' && raw.season_id > 0
  const pd = raw.page_data ?? {}
  const ep = raw.ep ?? {}

  const cid = isSeason ? raw.source?.cid ?? 0 : pd.cid ?? 0
  const bvid = (isSeason ? ep.bvid : raw.bvid) ?? ''
  const page = isSeason ? String(ep.index ?? '') : String(pd.page ?? '')
  const part = (isSeason ? ep.title : pd.part) ?? raw.title ?? ''
  const quality = raw.video_quality ?? 0

  return {
    path,
    avid: String(raw.avid ?? path.split('/')[0] ?? ''),
    bvid,
    cid,
    title: raw.title ?? '(无标题)',
    part,
    page,
    owner: raw.owner_name ?? '(未知UP主)',
    ownerId: raw.owner_id ?? 0,
    typeTag: raw.type_tag ?? '',
    cover: raw.cover ?? '',
    quality,
    qualityLabel: qualityLabel(quality, raw.quality_pithy_description),
    width: pd.width ?? 0,
    height: pd.height ?? 0,
    durationMs: raw.total_time_milli ?? 0,
    danmaku: raw.danmaku_count ?? 0,
    totalBytes: raw.total_bytes ?? 0,
    downloadedBytes: raw.downloaded_bytes ?? 0,
    completed: raw.is_completed ?? false,
    isDash: raw.has_dash_audio ?? false,
    isCharge: raw.is_charge_video ?? false,
    isSeason,
    createdAt: raw.time_create_stamp ?? 0,
    mediaType: raw.media_type ?? 0,
    cacheVersion: raw.cache_version_code ?? 0,
  }
}

export interface Distribution {
  label: string
  count: number
  /** 附带的量级（如字节数），可选，用于排序或副信息。 */
  weight?: number
}

/** 聚合后的整份报告。 */
export interface CacheReport {
  itemCount: number
  videoCount: number
  totalBytes: number
  downloadedBytes: number
  totalDurationMs: number
  avgDurationMs: number
  maxDurationMs: number
  minDurationMs: number
  danmakuTotal: number
  itemsWithDanmaku: number
  completedCount: number
  incompleteCount: number
  dashCount: number
  legacyCount: number
  chargeCount: number
  earliest: number
  latest: number
  qualities: Distribution[]
  owners: Distribution[]
  resolutions: Distribution[]
  mediaTypes: Distribution[]
  /** 按投稿(avid)聚合的视频，含分集数与合计大小；多P在前。 */
  videos: VideoGroup[]
  items: CacheItem[]
}

export interface VideoGroup {
  avid: string
  bvid: string
  title: string
  owner: string
  pages: number
  totalBytes: number
  totalDurationMs: number
  danmaku: number
  quality: number
  qualityLabel: string
  completed: boolean
  createdAt: number
  isSeason: boolean
}

function tallyToSorted(map: Map<string, { count: number; weight: number }>): Distribution[] {
  return [...map.entries()]
    .map(([label, v]) => ({ label, count: v.count, weight: v.weight }))
    .sort((a, b) => b.count - a.count)
}

/** 核心聚合：把一组 CacheItem 汇总成 CacheReport。 */
export function aggregate(items: CacheItem[]): CacheReport {
  const qualityMap = new Map<string, { count: number; weight: number }>()
  const ownerMap = new Map<string, { count: number; weight: number }>()
  const resMap = new Map<string, { count: number; weight: number }>()
  const mediaMap = new Map<string, { count: number; weight: number }>()
  const videoMap = new Map<string, VideoGroup>()

  let totalBytes = 0
  let downloadedBytes = 0
  let totalDurationMs = 0
  let maxDurationMs = 0
  let minDurationMs = Number.POSITIVE_INFINITY
  let danmakuTotal = 0
  let itemsWithDanmaku = 0
  let completedCount = 0
  let dashCount = 0
  let chargeCount = 0
  let earliest = Number.POSITIVE_INFINITY
  let latest = 0

  const bump = (
    map: Map<string, { count: number; weight: number }>,
    label: string,
    weight = 0,
  ) => {
    const cur = map.get(label) ?? { count: 0, weight: 0 }
    cur.count += 1
    cur.weight += weight
    map.set(label, cur)
  }

  for (const it of items) {
    totalBytes += it.totalBytes
    downloadedBytes += it.downloadedBytes
    totalDurationMs += it.durationMs
    if (it.durationMs > maxDurationMs) maxDurationMs = it.durationMs
    if (it.durationMs > 0 && it.durationMs < minDurationMs) minDurationMs = it.durationMs
    danmakuTotal += it.danmaku
    if (it.danmaku > 0) itemsWithDanmaku += 1
    if (it.completed) completedCount += 1
    if (it.isDash) dashCount += 1
    if (it.isCharge) chargeCount += 1
    if (it.createdAt > 0) {
      if (it.createdAt < earliest) earliest = it.createdAt
      if (it.createdAt > latest) latest = it.createdAt
    }

    bump(qualityMap, it.qualityLabel, it.downloadedBytes)
    bump(ownerMap, it.owner, it.downloadedBytes)
    if (it.width > 0 && it.height > 0) bump(resMap, `${it.width}×${it.height}`)
    bump(mediaMap, mediaTypeLabel(it.mediaType))

    const g = videoMap.get(it.avid)
    if (g) {
      g.pages += 1
      g.totalBytes += it.downloadedBytes
      g.totalDurationMs += it.durationMs
      g.danmaku += it.danmaku
      if (!it.completed) g.completed = false
      if (it.createdAt > 0 && (g.createdAt === 0 || it.createdAt > g.createdAt)) {
        g.createdAt = it.createdAt
      }
    } else {
      videoMap.set(it.avid, {
        avid: it.avid,
        bvid: it.bvid,
        title: it.title,
        owner: it.owner,
        pages: 1,
        totalBytes: it.downloadedBytes,
        totalDurationMs: it.durationMs,
        danmaku: it.danmaku,
        quality: it.quality,
        qualityLabel: it.qualityLabel,
        completed: it.completed,
        createdAt: it.createdAt,
        isSeason: it.isSeason,
      })
    }
  }

  const videos = [...videoMap.values()].sort((a, b) => {
    if (b.pages !== a.pages) return b.pages - a.pages
    return b.createdAt - a.createdAt
  })

  return {
    itemCount: items.length,
    videoCount: videoMap.size,
    totalBytes,
    downloadedBytes,
    totalDurationMs,
    avgDurationMs: items.length > 0 ? totalDurationMs / items.length : 0,
    maxDurationMs,
    minDurationMs: Number.isFinite(minDurationMs) ? minDurationMs : 0,
    danmakuTotal,
    itemsWithDanmaku,
    completedCount,
    incompleteCount: items.length - completedCount,
    dashCount,
    legacyCount: items.length - dashCount,
    chargeCount,
    earliest: Number.isFinite(earliest) ? earliest : 0,
    latest,
    qualities: tallyToSorted(qualityMap),
    owners: tallyToSorted(ownerMap),
    resolutions: tallyToSorted(resMap),
    mediaTypes: tallyToSorted(mediaMap),
    videos,
    items,
  }
}

// ---------------------------------------------------------------------------
// 格式化工具
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  const digits = i >= 3 ? 2 : val >= 100 ? 0 : 1
  return `${val.toFixed(digits)} ${units[i]}`
}

/** 毫秒 → 紧凑时长，如 "1:23"、"12:05"、"1:02:33"。 */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** 毫秒 → 人类可读的长时长，如 "49h 56m"、"21.4 分钟"。 */
export function formatLongDuration(ms: number): string {
  const totalMin = ms / 60000
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60)
    const m = Math.round(totalMin % 60)
    return `${h}h ${m}m`
  }
  return `${totalMin.toFixed(1)} 分钟`
}

/** 毫秒时间戳 → YYYY-MM-DD（本地时区）。 */
export function formatDate(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 两个时间戳之间的跨度描述，如 "约 14 个月"。 */
export function spanDescription(from: number, to: number): string {
  if (!from || !to || to <= from) return '—'
  const days = Math.round((to - from) / 86400000)
  if (days < 1) return '不足一天'
  if (days < 60) return `约 ${days} 天`
  const months = Math.round(days / 30)
  if (months < 24) return `约 ${months} 个月`
  return `约 ${(days / 365).toFixed(1)} 年`
}
