/**
 * 播放相关的媒体处理：
 *  - 解析 B站 danmaku.xml → ArtPlayer 弹幕数组
 *  - 用 mp4box 探测 fMP4 的编码，构造 MSE 的 codec MIME
 *  - 通过 MediaSource + 双 SourceBuffer 同步播放分离的视频流 / 音频流
 *
 * B站缓存的 video.m4s / audio.m4s 是标准 fragmented-MP4（实测以 `ftyp` 开头，
 * 无额外前缀），可直接喂给 MSE；本模块仍保留防御性的前缀定位以兼容异常样本。
 */
import { createFile } from 'mp4box'

// ---- 弹幕 ----------------------------------------------------------------

export interface DanmakuItem {
  text: string
  time: number
  color: string
  /** 0 滚动 / 1 顶部 / 2 底部（ArtPlayer danmuku 插件的 mode）。 */
  mode: 0 | 1 | 2
}

/** 十进制颜色整数 → #RRGGBB。 */
function intToHex(color: number): string {
  const c = (color & 0xffffff).toString(16).padStart(6, '0')
  return `#${c}`
}

/**
 * 解析 B站 danmaku.xml。每条 `<d p="progress,mode,fontsize,color,...">text</d>`：
 *  - progress: 出现时间（秒）
 *  - mode: 1/2/3/6 滚动，5 顶部，4 底部
 */
export function parseDanmaku(xml: string): DanmakuItem[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.querySelector('parsererror')) return []
  const out: DanmakuItem[] = []
  for (const d of Array.from(doc.getElementsByTagName('d'))) {
    const p = d.getAttribute('p')
    const text = d.textContent ?? ''
    if (!p || !text) continue
    const parts = p.split(',')
    const time = Number(parts[0])
    const rawMode = Number(parts[1])
    const color = Number(parts[3])
    if (!Number.isFinite(time)) continue
    const mode: 0 | 1 | 2 = rawMode === 5 ? 1 : rawMode === 4 ? 2 : 0
    out.push({ text, time, color: intToHex(Number.isFinite(color) ? color : 0xffffff), mode })
  }
  out.sort((a, b) => a.time - b.time)
  return out
}

// ---- fMP4 / MSE 流式播放 --------------------------------------------------

export interface ProbedCodecs {
  video?: string
  audio?: string
}

/** 编码不被当前浏览器支持（如无硬件 HEVC 解码）时抛出。 */
export class UnsupportedCodecError extends Error {
  codec: string
  constructor(codec: string) {
    super(`当前浏览器无法解码该视频编码：${codec}`)
    this.codec = codec
    this.name = 'UnsupportedCodecError'
  }
}

/** 最小的字节流读取接口，兼容 DOM ReadableStream 与 @yume-chan 的 ReadableStream。 */
export interface ByteReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>
  cancel(reason?: unknown): Promise<void> | void
  releaseLock?: () => void
}
export interface ByteStream {
  getReader(): ByteReader
}

export interface DualStreamHandle {
  destroy: () => void
}

// 缓冲窗口（秒）：向前最多缓存 MAX_AHEAD，配额溢出时保留播放点之前 KEEP_BEHIND，
// 其余驱逐。内存占用因此被限制在“数十秒视频”量级，而非整段文件。
const MAX_AHEAD = 30
const KEEP_BEHIND = 20
const PROBE_LIMIT = 8 * 1024 * 1024

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** 等待 SourceBuffer 本次 update 结束。 */
function waitUpdateEnd(sb: SourceBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      cleanup()
      resolve()
    }
    const err = () => {
      cleanup()
      reject(new Error('SourceBuffer error'))
    }
    const cleanup = () => {
      sb.removeEventListener('updateend', ok)
      sb.removeEventListener('error', err)
    }
    sb.addEventListener('updateend', ok)
    sb.addEventListener('error', err)
  })
}

/** append 一个分片并等待完成；配额溢出由 QuotaExceededError 同步抛出。 */
function appendOnce(sb: SourceBuffer, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      cleanup()
      resolve()
    }
    const err = () => {
      cleanup()
      reject(new Error('SourceBuffer error'))
    }
    const cleanup = () => {
      sb.removeEventListener('updateend', ok)
      sb.removeEventListener('error', err)
    }
    sb.addEventListener('updateend', ok)
    sb.addEventListener('error', err)
    try {
      sb.appendBuffer(chunk as unknown as BufferSource)
    } catch (e) {
      cleanup()
      reject(e)
    }
  })
}

/** 当前播放点之后已缓冲的时长（秒）。 */
function bufferedAhead(sb: SourceBuffer, t: number): number {
  const b = sb.buffered
  for (let i = 0; i < b.length; i++) {
    if (t >= b.start(i) - 0.25 && t <= b.end(i) + 0.25) return b.end(i) - t
  }
  return 0
}

/** 驱逐播放点之前的旧数据，成功返回 true。 */
async function evict(sb: SourceBuffer, t: number): Promise<boolean> {
  if (sb.updating) await waitUpdateEnd(sb).catch(() => {})
  const b = sb.buffered
  if (!b.length) return false
  const start = b.start(0)
  const removeEnd = t - KEEP_BEHIND
  if (removeEnd <= start + 0.5) return false
  try {
    const done = waitUpdateEnd(sb)
    sb.remove(start, removeEnd)
    await done
    return true
  } catch {
    return false
  }
}

/** 带背压 + 驱逐的分片写入。 */
async function appendManaged(
  sb: SourceBuffer,
  chunk: Uint8Array,
  video: HTMLVideoElement,
  isStopped: () => boolean,
): Promise<void> {
  // 背压：缓冲已足够超前时暂停读取，避免无限占用内存
  while (!isStopped() && bufferedAhead(sb, video.currentTime) > MAX_AHEAD) {
    await delay(250)
  }
  for (;;) {
    if (isStopped()) return
    if (sb.updating) await waitUpdateEnd(sb).catch(() => {})
    try {
      await appendOnce(sb, chunk)
      return
    } catch (e) {
      if ((e as DOMException).name === 'QuotaExceededError') {
        const evicted = await evict(sb, video.currentTime)
        if (!evicted) await delay(300) // 无可驱逐（暂停中缓冲已满）→ 等播放推进
        continue
      }
      return // MediaSource 已关闭等：安静退出
    }
  }
}

interface InitProbe {
  codecs: ProbedCodecs
  /** 探测时已读出的分片，需补回 SourceBuffer。 */
  pending: Uint8Array[]
}

/** 从流首部增量读取，用 mp4box 探测编码，并保留已读分片。 */
async function peekInit(reader: ByteReader): Promise<InitProbe> {
  const file = createFile() as unknown as {
    onReady: (info: { videoTracks?: { codec: string }[]; audioTracks?: { codec: string }[] }) => void
    onError: (e: unknown) => void
    appendBuffer: (b: ArrayBuffer) => void
    flush: () => void
  }
  let codecs: ProbedCodecs | null = null
  file.onReady = (info) => {
    codecs = { video: info.videoTracks?.[0]?.codec, audio: info.audioTracks?.[0]?.codec }
  }
  file.onError = () => {}

  const pending: Uint8Array[] = []
  let offset = 0
  while (!codecs && offset < PROBE_LIMIT) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    pending.push(value)
    const copy = value.slice()
    const ab = copy.buffer as ArrayBuffer & { fileStart?: number }
    ab.fileStart = offset
    offset += value.length
    try {
      file.appendBuffer(ab)
    } catch {
      /* ignore */
    }
  }
  try {
    file.flush()
  } catch {
    /* ignore */
  }
  return { codecs: codecs ?? {}, pending }
}

/**
 * 以「流式」方式把分离的视频流 / 音频流挂到 `<video>` 上：
 *  - 增量探测编码后创建 SourceBuffer
 *  - 边读边写，超前太多则背压暂停读取，配额溢出则驱逐旧数据
 *  - 全程内存受限于缓冲窗口，可播放任意大小的缓存视频
 * @throws UnsupportedCodecError 当视频编码不受支持
 */
export async function attachDualStreamStreaming(
  video: HTMLVideoElement,
  videoStream: ByteStream,
  audioStream: ByteStream,
): Promise<DualStreamHandle> {
  const vReader = videoStream.getReader()
  const aReader = audioStream.getReader()

  const vProbe = await peekInit(vReader)
  const aProbe = await peekInit(aReader)
  const videoCodec = vProbe.codecs.video ?? 'avc1.640028'
  const audioCodec = aProbe.codecs.audio ?? 'mp4a.40.2'
  const videoMime = `video/mp4; codecs="${videoCodec}"`
  const audioMime = `audio/mp4; codecs="${audioCodec}"`

  if (!MediaSource.isTypeSupported(videoMime)) {
    await Promise.resolve(vReader.cancel()).catch(() => {})
    await Promise.resolve(aReader.cancel()).catch(() => {})
    throw new UnsupportedCodecError(videoCodec)
  }

  const mediaSource = new MediaSource()
  const objectUrl = URL.createObjectURL(mediaSource)
  video.src = objectUrl
  await new Promise<void>((resolve) => {
    mediaSource.addEventListener('sourceopen', () => resolve(), { once: true })
  })

  const videoSb = mediaSource.addSourceBuffer(videoMime)
  const audioOk = MediaSource.isTypeSupported(audioMime)
  const audioSb = audioOk ? mediaSource.addSourceBuffer(audioMime) : null
  if (!audioSb) await Promise.resolve(aReader.cancel()).catch(() => {})

  let stopped = false
  const isStopped = () => stopped

  const pump = async (reader: ByteReader, sb: SourceBuffer, pending: Uint8Array[]) => {
    for (const chunk of pending) {
      if (stopped) return
      await appendManaged(sb, chunk, video, isStopped)
    }
    for (;;) {
      if (stopped) return
      const { done, value } = await reader.read()
      if (done) return
      if (value) await appendManaged(sb, value, video, isStopped)
    }
  }

  const pumps = [pump(vReader, videoSb, vProbe.pending)]
  if (audioSb) pumps.push(pump(aReader, audioSb, aProbe.pending))

  Promise.all(pumps)
    .then(() => {
      if (!stopped && mediaSource.readyState === 'open') {
        try {
          mediaSource.endOfStream()
        } catch {
          /* ignore */
        }
      }
    })
    .catch(() => {})

  return {
    destroy: () => {
      stopped = true
      Promise.resolve(vReader.cancel()).catch(() => {})
      Promise.resolve(aReader.cancel()).catch(() => {})
      try {
        if (mediaSource.readyState === 'open') mediaSource.endOfStream()
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(objectUrl)
    },
  }
}
