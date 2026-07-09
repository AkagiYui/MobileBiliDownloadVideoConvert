/**
 * 用真实设备上拉取的 140 份 entry.json 验证 bili.ts 的解析/聚合逻辑，
 * 对照桌面 Python 分析脚本的输出，确保 Web 端算出的数字一致。
 *
 * 运行：node --experimental-strip-types scripts/verify-fixtures.ts <fixtureDir>
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { aggregate, parseEntry, formatBytes, formatLongDuration, formatDate, spanDescription } from '../src/lib/bili.ts'
import type { RawEntry } from '../src/lib/bili.ts'

const dir = process.argv[2]
if (!dir) {
  console.error('用法: node --experimental-strip-types scripts/verify-fixtures.ts <fixtureDir>')
  process.exit(1)
}

const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
const items = files.map((f) => {
  const raw = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as RawEntry
  return parseEntry(raw, f.replace(/\.json$/, ''))
})

const r = aggregate(items)

console.log('=== 汇总 ===')
console.log(`条目 / 视频       : ${r.itemCount} / ${r.videoCount}`)
console.log(`已下载 / 理论总量 : ${formatBytes(r.downloadedBytes)} / ${formatBytes(r.totalBytes)}`)
console.log(`总时长            : ${formatLongDuration(r.totalDurationMs)}  (均 ${formatLongDuration(r.avgDurationMs)})`)
console.log(`最长 / 最短       : ${formatLongDuration(r.maxDurationMs)} / ${formatLongDuration(r.minDurationMs)}`)
console.log(`弹幕总数          : ${r.danmakuTotal}  (含弹幕条目 ${r.itemsWithDanmaku})`)
console.log(`完成 / 未完成     : ${r.completedCount} / ${r.incompleteCount}`)
console.log(`DASH / 旧FLV      : ${r.dashCount} / ${r.legacyCount}`)
console.log(`付费视频          : ${r.chargeCount}`)
console.log(`时间跨度          : ${formatDate(r.earliest)} ~ ${formatDate(r.latest)}  (${spanDescription(r.earliest, r.latest)})`)

console.log('\n=== 画质分布 ===')
for (const q of r.qualities) console.log(`  ${q.label.padEnd(8)} ${q.count}`)

console.log('\n=== UP主 Top5 ===')
for (const o of r.owners.slice(0, 5)) console.log(`  ${o.label.padEnd(20)} ${o.count}`)

console.log('\n=== 多P视频 ===')
for (const v of r.videos.filter((v) => v.pages > 1)) {
  console.log(`  ${String(v.pages).padStart(3)}P  ${v.owner} | ${v.title.slice(0, 30)}`)
}

console.log(`\n视频分组总数: ${r.videos.length}`)
