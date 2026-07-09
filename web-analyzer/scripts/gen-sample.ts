/**
 * 从真实拉取的 entry.json fixtures 生成 public/sample-items.json，
 * 供 Web 端「载入示例」使用（无手机也能预览完整报告）。
 * 运行：node --experimental-strip-types scripts/gen-sample.ts <fixtureDir>
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEntry } from '../src/lib/bili.ts'
import type { RawEntry } from '../src/lib/bili.ts'

const dir = process.argv[2]
if (!dir) {
  console.error('用法: node --experimental-strip-types scripts/gen-sample.ts <fixtureDir>')
  process.exit(1)
}
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
const items = files.map((f) =>
  parseEntry(JSON.parse(readFileSync(join(dir, f), 'utf-8')) as RawEntry, f.replace(/\.json$/, '')),
)
writeFileSync('public/sample-items.json', JSON.stringify(items))
console.log(`wrote ${items.length} items -> public/sample-items.json`)
