/**
 * WebUSB ↔ ADB 连接层，基于 Tango (@yume-chan/adb)。
 *
 * 只用到 ADB 的 sync 子协议（等价于 `adb pull`）来遍历目录、读取
 * entry.json —— 与桌面 adb 走同一套协议，因此对 Android 11+ 的
 * Android/data 隔离目录同样具备 shell 用户的读取权限。
 */
import { Adb, AdbDaemonTransport, LinuxFileType } from '@yume-chan/adb'
import { AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb'
import AdbWebCredentialStore from '@yume-chan/adb-credential-web'
import type { ReadableStream as YumeReadableStream } from '@yume-chan/stream-extra'
import { parseEntry, type CacheItem, type RawEntry } from './bili'
import type { ByteStream } from './media'

export interface DeviceInfo {
  serial: string
  name: string
  model: string
  brand: string
  androidRelease: string
  sdk: string
}

export interface ScanProgress {
  phase: 'listing' | 'reading' | 'done'
  done: number
  total: number
  label?: string
}

export interface ScanResult {
  items: CacheItem[]
  skipped: number
  errors: string[]
}

export interface Connection {
  adb: Adb
  device: DeviceInfo
  /** 关闭底层 transport 与 USB 连接。 */
  close: () => Promise<void>
}

export function isWebUsbSupported(): boolean {
  return AdbDaemonWebUsbDeviceManager.BROWSER !== undefined
}

/**
 * 弹出浏览器的 WebUSB 设备选择器，握手鉴权，返回可用的 Adb 连接。
 * 若用户取消选择则返回 null。
 */
export async function connect(): Promise<Connection | null> {
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER
  if (!manager) {
    throw new Error('当前浏览器不支持 WebUSB，请使用 Chrome / Edge 等 Chromium 内核浏览器。')
  }

  const device = await manager.requestDevice()
  if (!device) return null // 用户取消

  const connection = await device.connect()
  const credentialStore = new AdbWebCredentialStore('bilj-cache-analyzer')

  const transport = await AdbDaemonTransport.authenticate({
    serial: device.serial,
    connection,
    credentialStore,
  })

  const adb = new Adb(transport)

  const getProp = async (key: string) => {
    try {
      return (await adb.getProp(key)).trim()
    } catch {
      return ''
    }
  }
  const [model, brand, androidRelease, sdk] = await Promise.all([
    getProp('ro.product.model'),
    getProp('ro.product.brand'),
    getProp('ro.build.version.release'),
    getProp('ro.build.version.sdk'),
  ])

  return {
    adb,
    device: {
      serial: device.serial,
      name: device.name,
      model,
      brand,
      androidRelease,
      sdk,
    },
    close: async () => {
      await adb.close()
    },
  }
}

/** 把 sync.read() 的字节流读成完整的 Uint8Array，可选进度回调（已读字节数）。 */
async function readStreamToBytes(
  stream: YumeReadableStream<Uint8Array>,
  onProgress?: (bytesRead: number) => void,
): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        length += value.length
        onProgress?.(length)
      }
    }
  } finally {
    reader.releaseLock()
  }
  const merged = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}

/** 把 sync.read() 的字节流读成 UTF-8 字符串。 */
async function readStreamToText(stream: YumeReadableStream<Uint8Array>): Promise<string> {
  return new TextDecoder('utf-8').decode(await readStreamToBytes(stream))
}

export interface MediaBundle {
  video: Uint8Array
  audio: Uint8Array
  danmaku?: string
}

export type MediaReadProgress = (stream: 'video' | 'audio', bytesRead: number) => void

/**
 * 读取某个缓存条目的媒体：video.m4s / audio.m4s / danmaku.xml。
 * 仅支持 DASH（音视频分离）缓存。
 */
export async function readMedia(
  adb: Adb,
  packageName: string,
  item: { path: string; typeTag: string },
  onProgress?: MediaReadProgress,
): Promise<MediaBundle> {
  const base = `${cacheRoot(packageName)}/${item.path}`
  const dir = item.typeTag ? `${base}/${item.typeTag}` : base
  const sync = await adb.sync()
  try {
    const video = await readStreamToBytes(sync.read(`${dir}/video.m4s`), (n) =>
      onProgress?.('video', n),
    )
    const audio = await readStreamToBytes(sync.read(`${dir}/audio.m4s`), (n) =>
      onProgress?.('audio', n),
    )
    let danmaku: string | undefined
    try {
      danmaku = await readStreamToText(sync.read(`${base}/danmaku.xml`))
    } catch {
      /* 无弹幕文件 */
    }
    return { video, audio, danmaku }
  } finally {
    await sync.dispose()
  }
}

export interface MediaStreamBundle {
  video: ByteStream
  audio: ByteStream
  danmaku?: string
  /** 关闭底层 sync 会话；应在取消流读取之后调用。 */
  dispose: () => Promise<void>
}

/**
 * 打开某个缓存条目的媒体「流」用于流式播放：video.m4s / audio.m4s 分别用
 * 独立的 sync 会话，可并发按需拉取（不把整段读进内存）。danmaku.xml 体积小，
 * 直接读全。仅支持 DASH 缓存。
 */
export async function openMediaStreams(
  adb: Adb,
  packageName: string,
  item: { path: string; typeTag: string },
): Promise<MediaStreamBundle> {
  const base = `${cacheRoot(packageName)}/${item.path}`
  const dir = item.typeTag ? `${base}/${item.typeTag}` : base

  let danmaku: string | undefined
  try {
    const syncD = await adb.sync()
    try {
      danmaku = await readStreamToText(syncD.read(`${base}/danmaku.xml`))
    } finally {
      await syncD.dispose()
    }
  } catch {
    /* 无弹幕文件 */
  }

  const syncV = await adb.sync()
  const syncA = await adb.sync()
  const video = syncV.read(`${dir}/video.m4s`) as unknown as ByteStream
  const audio = syncA.read(`${dir}/audio.m4s`) as unknown as ByteStream

  return {
    video,
    audio,
    danmaku,
    dispose: async () => {
      try {
        await syncV.dispose()
      } catch {
        /* ignore */
      }
      try {
        await syncA.dispose()
      } catch {
        /* ignore */
      }
    },
  }
}

/** 默认的 B站缓存根目录（download 目录）。 */
export function cacheRoot(packageName: string): string {
  return `/sdcard/Android/data/${packageName}/download`
}

/**
 * 遍历 `download/<avid>/<sub>/entry.json`，读取并解析所有缓存条目。
 * @param onProgress 进度回调，用于驱动 UI。
 */
export async function scanCache(
  adb: Adb,
  packageName: string,
  onProgress?: (p: ScanProgress) => void,
): Promise<ScanResult> {
  const root = cacheRoot(packageName)
  const sync = await adb.sync()
  const items: CacheItem[] = []
  const errors: string[] = []
  let skipped = 0

  try {
    // 1) 列出所有 <avid> 目录
    let avDirs: string[]
    try {
      avDirs = (await sync.readdir(root))
        .filter((e) => e.type === LinuxFileType.Directory && e.name !== '.' && e.name !== '..')
        .map((e) => e.name)
    } catch (err) {
      throw new Error(
        `无法读取缓存目录 ${root}：${(err as Error).message}。` +
          `请确认该应用已安装、且缓存过视频。`,
      )
    }

    // 2) 列出每个 <avid> 下的分P/分集子目录，得到待读取的 entry.json 清单
    onProgress?.({ phase: 'listing', done: 0, total: avDirs.length })
    const targets: { path: string; file: string }[] = []
    for (let i = 0; i < avDirs.length; i++) {
      const av = avDirs[i]
      try {
        const subs = (await sync.readdir(`${root}/${av}`)).filter(
          (e) => e.type === LinuxFileType.Directory && e.name !== '.' && e.name !== '..',
        )
        for (const sub of subs) {
          targets.push({ path: `${av}/${sub.name}`, file: `${root}/${av}/${sub.name}/entry.json` })
        }
      } catch {
        skipped += 1
      }
      onProgress?.({ phase: 'listing', done: i + 1, total: avDirs.length })
    }

    // 3) 逐个读取 entry.json 并解析
    for (let i = 0; i < targets.length; i++) {
      const { path, file } = targets[i]
      try {
        const text = await readStreamToText(sync.read(file))
        const raw = JSON.parse(text) as RawEntry
        items.push(parseEntry(raw, path))
      } catch (err) {
        skipped += 1
        errors.push(`${path}: ${(err as Error).message}`)
      }
      onProgress?.({ phase: 'reading', done: i + 1, total: targets.length, label: path })
    }
  } finally {
    await sync.dispose()
  }

  onProgress?.({ phase: 'done', done: items.length, total: items.length })
  return { items, skipped, errors }
}
