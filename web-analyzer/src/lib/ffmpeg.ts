/**
 * 基于 ffmpeg.wasm（单线程 core，无需 SharedArrayBuffer）的本地导出：
 *  - 保存视频流 / 音频流 / 混流到本地
 *  - 全部使用 `-c copy` 无损重封装（不重新编码，快且与编码无关）
 *  - 写入标题 / UP主 / BV号 / 日期等元数据，可选嵌入封面
 *
 * core 文件随应用一起托管在 `/ffmpeg/` 下（同源，避免跨域与 CORS）。
 */
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

export interface ExportMeta {
  title: string
  artist: string
  /** 备注，一般写 BV号 / av号。 */
  comment: string
  /** 年份或日期字符串。 */
  date?: string
}

export interface ExportProgress {
  ratio: number
  message?: string
}

let ffmpeg: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

/**
 * core 文件放在 /public 下，但不能被源码 import（会被 Vite 转换拦截）。
 * 用 toBlobURL 以 fetch 方式取回并转成 blob: URL，worker 再 import 该 blob。
 */
async function coreUrls() {
  const base = `${import.meta.env.BASE_URL}ffmpeg`
  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  ])
  return { coreURL, wasmURL }
}

/** 懒加载 ffmpeg.wasm 单例。 */
export async function loadFfmpeg(onLog?: (line: string) => void): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg
  if (loadPromise) return loadPromise
  const ff = new FFmpeg()
  if (onLog) ff.on('log', ({ message }) => onLog(message))
  loadPromise = coreUrls()
    .then((urls) => ff.load(urls))
    .then(() => {
      ffmpeg = ff
      return ff
    })
    .catch((err) => {
      loadPromise = null // 允许重试
      throw err
    })
  return loadPromise
}

export function isFfmpegLoaded(): boolean {
  return ffmpeg !== null
}

function metaArgs(meta: ExportMeta): string[] {
  const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()
  const args = [
    '-metadata',
    `title=${clean(meta.title)}`,
    '-metadata',
    `artist=${clean(meta.artist)}`,
    '-metadata',
    `comment=${clean(meta.comment)}`,
  ]
  if (meta.date) args.push('-metadata', `date=${meta.date}`)
  return args
}

async function run(
  ff: FFmpeg,
  inputs: { name: string; data: Uint8Array }[],
  args: string[],
  outName: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<Uint8Array> {
  const handler = ({ progress }: { progress: number }) =>
    onProgress?.({ ratio: Math.max(0, Math.min(1, progress)) })
  ff.on('progress', handler)
  try {
    // 传副本：writeFile 会把 ArrayBuffer transfer 给 worker 从而 detach 原数组，
    // 克隆后原始的 loaded.video/audio 仍可用于再次导出或播放。
    for (const i of inputs) await ff.writeFile(i.name, i.data.slice())
    await ff.exec(args)
    const out = (await ff.readFile(outName)) as Uint8Array
    // 清理 MEMFS，释放内存
    for (const i of inputs) await ff.deleteFile(i.name).catch(() => {})
    await ff.deleteFile(outName).catch(() => {})
    return out
  } finally {
    ff.off('progress', handler)
  }
}

/** 视频流 → mp4（仅视频，重封装 + 元数据）。 */
export async function exportVideo(
  videoBytes: Uint8Array,
  meta: ExportMeta,
  onProgress?: (p: ExportProgress) => void,
): Promise<Uint8Array> {
  const ff = await loadFfmpeg()
  const args = [
    '-i',
    'video.m4s',
    '-c',
    'copy',
    ...metaArgs(meta),
    '-movflags',
    '+faststart',
    'out.mp4',
  ]
  return run(ff, [{ name: 'video.m4s', data: videoBytes }], args, 'out.mp4', onProgress)
}

/** 音频流 → m4a（重封装 + 元数据，可选封面）。 */
export async function exportAudio(
  audioBytes: Uint8Array,
  meta: ExportMeta,
  coverBytes?: Uint8Array,
  onProgress?: (p: ExportProgress) => void,
): Promise<Uint8Array> {
  const ff = await loadFfmpeg()
  const inputs = [{ name: 'audio.m4s', data: audioBytes }]
  const args = ['-i', 'audio.m4s']
  if (coverBytes) {
    inputs.push({ name: 'cover.jpg', data: coverBytes })
    args.push('-i', 'cover.jpg', '-map', '0:a', '-map', '1', '-disposition:v:0', 'attached_pic')
  }
  args.push('-c', 'copy', ...metaArgs(meta), 'out.m4a')
  return run(ff, inputs, args, 'out.m4a', onProgress)
}

/** 视频流 + 音频流 → mp4 混流（重封装 + 元数据，可选封面）。 */
export async function exportMuxed(
  videoBytes: Uint8Array,
  audioBytes: Uint8Array,
  meta: ExportMeta,
  coverBytes?: Uint8Array,
  onProgress?: (p: ExportProgress) => void,
): Promise<Uint8Array> {
  const ff = await loadFfmpeg()
  const inputs = [
    { name: 'video.m4s', data: videoBytes },
    { name: 'audio.m4s', data: audioBytes },
  ]
  const args = ['-i', 'video.m4s', '-i', 'audio.m4s']
  if (coverBytes) {
    inputs.push({ name: 'cover.jpg', data: coverBytes })
    args.push(
      '-i',
      'cover.jpg',
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-map',
      '2:v:0',
      '-disposition:v:1',
      'attached_pic',
    )
  } else {
    args.push('-map', '0:v:0', '-map', '1:a:0')
  }
  args.push('-c', 'copy', ...metaArgs(meta), '-movflags', '+faststart', 'out.mp4')
  return run(ff, inputs, args, 'out.mp4', onProgress)
}

/** 触发浏览器下载。 */
export function downloadBytes(data: Uint8Array, filename: string, mime: string) {
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  const blob = new Blob([ab], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** 转成 Windows/跨平台安全的文件名。 */
export function safeFilename(name: string): string {
  return name.replace(/[/\\*?"<>|:\r\n]+/g, '_').slice(0, 120)
}
