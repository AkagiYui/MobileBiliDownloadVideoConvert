/**
 * 本地保存工具。
 *  - saveStreamed：请求浏览器开始下载（File System Access API），再从手机/网络
 *    边拉边写到磁盘，内存不驻留整段，可保存超大文件；不支持该 API 时回退到内存 Blob。
 *  - downloadBytes：把已在内存中的字节直接触发下载（用于 ffmpeg 合成后的结果）。
 */
import type { ByteStream } from './media'

/** 转成 Windows/跨平台安全的文件名。 */
export function safeFilename(name: string): string {
  return name.replace(/[/\\*?"<>|:\r\n]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
}

/** 把已在内存中的字节触发浏览器下载（<a download> + Blob）。 */
export function downloadBytes(data: Uint8Array, filename: string, mime: string) {
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  const url = URL.createObjectURL(new Blob([ab], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function supportsFileSystemAccess(): boolean {
  return typeof (window as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function'
}

interface SaveSink {
  write: (chunk: Uint8Array) => Promise<void>
  close: () => Promise<void>
  abort: () => Promise<void>
}

interface FsWritable {
  write: (data: BufferSource) => Promise<void>
  close: () => Promise<void>
  abort?: () => Promise<void>
}
interface FsFileHandle {
  createWritable: () => Promise<FsWritable>
}
type ShowSaveFilePicker = (opts: {
  suggestedName?: string
  types?: { description?: string; accept: Record<string, string[]> }[]
}) => Promise<FsFileHandle>

/**
 * 打开一个写入槽：优先 File System Access（真流式到磁盘）；否则回退到内存收集后 Blob 下载。
 * 首个 await 即弹出保存对话框，需在用户手势内调用（否则会被浏览器拦截）。
 */
async function openSaveSink(filename: string, mime: string): Promise<SaveSink> {
  const picker = (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker
  if (typeof picker === 'function') {
    const dot = filename.lastIndexOf('.')
    const ext = dot >= 0 ? filename.slice(dot) : ''
    const handle = await picker({
      suggestedName: filename,
      types: ext ? [{ description: '文件', accept: { [mime]: [ext] } }] : undefined,
    })
    const writable = await handle.createWritable()
    return {
      write: (c) => writable.write(c as unknown as BufferSource),
      close: () => writable.close(),
      abort: () => (writable.abort ? writable.abort() : Promise.resolve()),
    }
  }
  // 回退：内存收集（受内存限制），关闭时一次性 Blob 下载
  const chunks: Uint8Array[] = []
  return {
    write: async (c) => {
      chunks.push(c.slice())
    },
    close: async () => {
      let len = 0
      for (const c of chunks) len += c.length
      const merged = new Uint8Array(len)
      let o = 0
      for (const c of chunks) {
        merged.set(c, o)
        o += c.length
      }
      downloadBytes(merged, filename, mime)
    },
    abort: async () => {},
  }
}

export interface StreamSource {
  stream: ByteStream
  /** 读取结束后清理（如关闭 ADB sync 会话）。 */
  dispose?: () => Promise<void>
}

/**
 * 流式保存：先请求保存位置，再打开数据源逐块写入磁盘。
 * @returns 'saved' 成功；'cancelled' 用户取消了保存对话框。
 */
export async function saveStreamed(
  filename: string,
  mime: string,
  open: () => Promise<StreamSource>,
  onProgress?: (bytesWritten: number) => void,
): Promise<'saved' | 'cancelled'> {
  let sink: SaveSink
  try {
    sink = await openSaveSink(filename, mime)
  } catch (err) {
    if ((err as DOMException).name === 'AbortError') return 'cancelled'
    throw err
  }

  const { stream, dispose } = await open()
  const reader = stream.getReader()
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        await sink.write(value)
        total += value.length
        onProgress?.(total)
      }
    }
    await sink.close()
    return 'saved'
  } catch (err) {
    await sink.abort().catch(() => {})
    throw err
  } finally {
    await dispose?.().catch(() => {})
  }
}
