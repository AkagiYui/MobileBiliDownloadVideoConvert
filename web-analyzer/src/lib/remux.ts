/**
 * 流式 fMP4 合并器（box 级，编码无关）。
 *
 * 把分离的 video.m4s / audio.m4s（各自是单轨 fragmented-MP4）合并成一个双轨 MP4，
 * 边读边写到输出，内存只驻留「一个分片」量级，可处理任意大小 —— 不经 ffmpeg。
 *
 * 做法（不解码、不碰编码，因此 AVC/HEVC/AV1/AAC 通吃）：
 *  1. 各读出 ftyp+moov 初始化段；把两条轨道的 track_ID 强制成 视频=1 / 音频=2，
 *     合成一个含两个 trak + mvex(两个 trex) 的 moov，写出 ftyp+moov。
 *  2. 之后逐个读取 (moof+mdat) 分片，按 tfdt 解码时间交织写出；改写 moof 里的
 *     tfhd.track_ID。因源分片用 default-base-is-moof（偏移相对 moof），无需改数据偏移。
 *  3. 丢弃 mfra/sidx/styp（其偏移在交织后失效或无用）。
 */
import type { ByteReader, ByteStream } from './media'

// ---- 字节/box 基础 --------------------------------------------------------

function rd32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
}
function wr32(b: Uint8Array, o: number, v: number): void {
  b[o] = (v >>> 24) & 0xff
  b[o + 1] = (v >>> 16) & 0xff
  b[o + 2] = (v >>> 8) & 0xff
  b[o + 3] = v & 0xff
}
function boxType(b: Uint8Array, o: number): string {
  return String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7])
}

interface BoxRef {
  type: string
  start: number
  size: number
  dataStart: number
  dataEnd: number
}

/** 在 [start,end) 内查找第一个指定类型的直接子 box。 */
function firstBox(b: Uint8Array, start: number, end: number, type: string): BoxRef | null {
  let o = start
  while (o + 8 <= end) {
    let size = rd32(b, o)
    let hdr = 8
    if (size === 1) {
      size = rd32(b, o + 8) * 0x100000000 + rd32(b, o + 12)
      hdr = 16
    } else if (size === 0) {
      size = end - o
    }
    if (size < 8) break
    if (boxType(b, o) === type) return { type, start: o, size, dataStart: o + hdr, dataEnd: o + size }
    o += size
  }
  return null
}

/** 沿嵌套路径（如 trak>mdia>mdhd）在 moov payload 内查找。 */
function findPath(moov: Uint8Array, path: string[]): BoxRef | null {
  let start = 8
  let end = moov.length
  let box: BoxRef | null = null
  for (const t of path) {
    box = firstBox(moov, start, end, t)
    if (!box) return null
    start = box.dataStart
    end = box.dataEnd
  }
  return box
}

/** 取出某类型子 box 的独立副本（offset 0 = 该 box 的 size 字段）。 */
function getChild(bx: Uint8Array, type: string): Uint8Array | null {
  const box = firstBox(bx, 8, bx.length, type)
  return box ? bx.slice(box.start, box.start + box.size) : null
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  let len = 0
  for (const a of arrs) len += a.length
  const out = new Uint8Array(len)
  let o = 0
  for (const a of arrs) {
    out.set(a, o)
    o += a.length
  }
  return out
}

function makeBox(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length)
  wr32(out, 0, out.length)
  out[4] = type.charCodeAt(0)
  out[5] = type.charCodeAt(1)
  out[6] = type.charCodeAt(2)
  out[7] = type.charCodeAt(3)
  out.set(payload, 8)
  return out
}

// ---- 字段改写 -------------------------------------------------------------

/** 强制某 trak 的 tkhd.track_ID。 */
function setTkhdTrackId(trak: Uint8Array, id: number): void {
  const tkhd = firstBox(trak, 8, trak.length, 'tkhd')
  if (!tkhd) return
  const version = trak[tkhd.dataStart]
  wr32(trak, tkhd.dataStart + 4 + (version === 1 ? 16 : 8), id)
}
/** 强制某 mvex 内首个 trex 的 track_ID（就地）。 */
function setTrexTrackId(mvexOrTrex: Uint8Array, id: number, isTrex = false): void {
  const trex = isTrex ? { start: 0 } : firstBox(mvexOrTrex, 8, mvexOrTrex.length, 'trex')
  if (!trex) return
  wr32(mvexOrTrex, trex.start + 12, id)
}
/** 强制某 moof 内 traf>tfhd 的 track_ID。 */
function setMoofTrackId(moof: Uint8Array, id: number): void {
  const traf = firstBox(moof, 8, moof.length, 'traf')
  if (!traf) return
  const tfhd = firstBox(moof, traf.dataStart, traf.dataEnd, 'tfhd')
  if (tfhd) wr32(moof, tfhd.start + 12, id)
}

function mdhdTimescale(moov: Uint8Array): number {
  const mdhd = findPath(moov, ['trak', 'mdia', 'mdhd'])
  if (!mdhd) return 1
  const version = moov[mdhd.dataStart]
  return rd32(moov, mdhd.dataStart + 4 + (version === 1 ? 16 : 8)) || 1
}

/** 分片解码起始时间（秒），取自 traf>tfdt.baseMediaDecodeTime。 */
function fragmentTime(moof: Uint8Array, timescale: number): number {
  const traf = firstBox(moof, 8, moof.length, 'traf')
  if (!traf) return 0
  const tfdt = firstBox(moof, traf.dataStart, traf.dataEnd, 'tfdt')
  if (!tfdt) return 0
  const version = moof[tfdt.dataStart]
  const bmdt =
    version === 1
      ? rd32(moof, tfdt.dataStart + 4) * 0x100000000 + rd32(moof, tfdt.dataStart + 8)
      : rd32(moof, tfdt.dataStart + 4)
  return bmdt / timescale
}

// ---- 合成初始化段 ---------------------------------------------------------

function buildInit(vftyp: Uint8Array, vmoov: Uint8Array, amoov: Uint8Array): Uint8Array {
  const mvhd = getChild(vmoov, 'mvhd')
  const vtrak = getChild(vmoov, 'trak')
  const vmvex = getChild(vmoov, 'mvex')
  const atrak = getChild(amoov, 'trak')
  const amvex = getChild(amoov, 'mvex')
  if (!mvhd || !vtrak || !vmvex || !atrak || !amvex) {
    throw new Error('缓存视频结构异常（缺少 moov 子结构），无法合并')
  }
  const atrex = getChild(amvex, 'trex')
  if (!atrex) throw new Error('音频缺少 trex，无法合并')

  wr32(mvhd, mvhd.length - 4, 3) // next_track_ID = 3
  setTkhdTrackId(vtrak, 1)
  setTrexTrackId(vmvex, 1) // vmvex 内的 trex → 1
  setTkhdTrackId(atrak, 2)
  setTrexTrackId(atrex, 2, true) // atrex 本身 → 2

  // 新 mvex = 视频 mvex 的子内容（含已改的 vtrex）+ 音频 trex
  const newMvex = makeBox('mvex', concat(vmvex.subarray(8), atrex))
  const newMoov = makeBox('moov', concat(mvhd, vtrak, atrak, newMvex))
  return concat(vftyp, newMoov)
}

// ---- 流式 box 读取 --------------------------------------------------------

class BoxSource {
  private buf = new Uint8Array(0)
  private done = false
  private reader: ByteReader
  constructor(reader: ByteReader) {
    this.reader = reader
  }

  private async fill(min: number): Promise<void> {
    while (this.buf.length < min && !this.done) {
      const { done, value } = await this.reader.read()
      if (done) {
        this.done = true
        break
      }
      if (value && value.length) {
        const merged = new Uint8Array(this.buf.length + value.length)
        merged.set(this.buf)
        merged.set(value, this.buf.length)
        this.buf = merged
      }
    }
  }

  /** 读出下一个顶层 box（完整）；流结束返回 null。 */
  async next(): Promise<{ type: string; bytes: Uint8Array } | null> {
    await this.fill(8)
    if (this.buf.length < 8) return null
    let size = rd32(this.buf, 0)
    if (size === 1) {
      await this.fill(16)
      size = rd32(this.buf, 8) * 0x100000000 + rd32(this.buf, 12)
    } else if (size === 0) {
      // 到文件尾：读完剩余
      await this.fill(Number.MAX_SAFE_INTEGER)
      size = this.buf.length
    }
    await this.fill(size)
    if (this.buf.length < size) return null // 截断
    const bytes = this.buf.slice(0, size)
    this.buf = this.buf.slice(size)
    return { type: boxType(bytes, 0), bytes }
  }

  async cancel(): Promise<void> {
    try {
      await this.reader.cancel()
    } catch {
      /* ignore */
    }
  }
}

async function readInit(src: BoxSource): Promise<{ ftyp: Uint8Array; moov: Uint8Array }> {
  let ftyp: Uint8Array | null = null
  let moov: Uint8Array | null = null
  for (;;) {
    const box = await src.next()
    if (!box) break
    if (box.type === 'ftyp') ftyp = box.bytes
    else if (box.type === 'moov') {
      moov = box.bytes
      break
    }
  }
  if (!moov) throw new Error('未找到 moov，不是有效的缓存视频')
  // 无 ftyp 时补一个标准 ftyp
  if (!ftyp) ftyp = makeBox('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 0x69, 0x73, 0x6f, 0x6d]))
  return { ftyp, moov }
}

interface Fragment {
  moof: Uint8Array
  mdat: Uint8Array
  time: number
}

async function nextFragment(src: BoxSource, timescale: number): Promise<Fragment | null> {
  let moof: Uint8Array | null = null
  for (;;) {
    const box = await src.next()
    if (!box) return null
    if (box.type === 'moof') {
      moof = box.bytes
      break
    }
    // 跳过 mfra / sidx / styp / free 等
  }
  const mdatBox = await src.next()
  if (!mdatBox || mdatBox.type !== 'mdat') {
    throw new Error('分片结构异常（moof 后未跟随 mdat）')
  }
  return { moof, mdat: mdatBox.bytes, time: fragmentTime(moof, timescale) }
}

/**
 * 把 video/audio 两条 fMP4 流合并成一个双轨 MP4，逐块写入 write。
 * @param write 输出写入回调（写到磁盘/文件句柄）
 * @param onProgress 已写字节数回调
 */
export async function remuxFmp4(
  videoStream: ByteStream,
  audioStream: ByteStream,
  write: (chunk: Uint8Array) => Promise<void>,
  onProgress?: (bytesWritten: number) => void,
): Promise<void> {
  const vsrc = new BoxSource(videoStream.getReader())
  const asrc = new BoxSource(audioStream.getReader())
  try {
    const vInit = await readInit(vsrc)
    const aInit = await readInit(asrc)
    const vts = mdhdTimescale(vInit.moov)
    const ats = mdhdTimescale(aInit.moov)

    const init = buildInit(vInit.ftyp, vInit.moov, aInit.moov)
    await write(init)
    let written = init.length

    let v = await nextFragment(vsrc, vts)
    let a = await nextFragment(asrc, ats)
    while (v || a) {
      const useVideo = !a || (v !== null && v.time <= a.time)
      const frag = (useVideo ? v : a) as Fragment
      setMoofTrackId(frag.moof, useVideo ? 1 : 2)
      await write(frag.moof)
      await write(frag.mdat)
      written += frag.moof.length + frag.mdat.length
      onProgress?.(written)
      if (useVideo) v = await nextFragment(vsrc, vts)
      else a = await nextFragment(asrc, ats)
    }
  } finally {
    await vsrc.cancel()
    await asrc.cancel()
  }
}
