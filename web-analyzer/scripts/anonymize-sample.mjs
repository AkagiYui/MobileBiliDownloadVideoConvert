// 将 public/sample-items.json 中的可识别信息（标题 / UP主 / BV号 / avid / cid /
// 封面 URL）替换为合成占位数据，但保留全部统计特征：条目数、投稿分组、画质 /
// 时长 / 体积 / 弹幕 / 时间线分布，以及 UP主分布的形状。用于把示例数据脱敏后入库。
//
// 运行：node scripts/anonymize-sample.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const file = resolve(root, 'public/sample-items.json')
const items = JSON.parse(readFileSync(file, 'utf-8'))

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const fakeBvid = (n) => {
  let s = '',
    x = (n * 2654435761) >>> 0
  for (let i = 0; i < 9; i++) {
    s += B58[x % 58]
    x = Math.floor(x / 58) + (i + 1) * 97
  }
  return 'BV1' + s
}

// UP主：按出现频次排名映射为合成名，保持分布形状（谁最多仍最多）
const ownerCount = new Map()
for (const it of items) ownerCount.set(it.owner, (ownerCount.get(it.owner) || 0) + 1)
const ownersByFreq = [...ownerCount.entries()].sort((a, b) => b[1] - a[1]).map(([o]) => o)
const ownerMap = new Map(
  ownersByFreq.map((o, i) => [o, `示例UP主${String(i + 1).padStart(2, '0')}`]),
)

// 投稿(avid)：保持分组，同一投稿映射到同一 fake avid / title / bvid
const avidOrder = []
const seen = new Set()
for (const it of items)
  if (!seen.has(it.avid)) {
    seen.add(it.avid)
    avidOrder.push(it.avid)
  }
const avidMap = new Map(
  avidOrder.map((a, i) => [
    a,
    {
      avid: String(900000000000 + i),
      bvid: fakeBvid(i + 1),
      title: `示例视频 ${String(i + 1).padStart(3, '0')}`,
    },
  ]),
)

const out = items.map((it, idx) => {
  const a = avidMap.get(it.avid)
  const multiPart = it.part && it.part !== it.title
  return {
    ...it,
    avid: a.avid,
    bvid: a.bvid,
    title: a.title,
    part: multiPart ? `示例分段 P${it.page || idx}` : a.title,
    owner: ownerMap.get(it.owner),
    ownerId: 10000 + ownersByFreq.indexOf(it.owner),
    cid: 200000000 + idx,
    cover: '',
    path: `${a.avid}/p${it.page || 1}_${idx}`,
  }
})

writeFileSync(file, JSON.stringify(out))
console.log(
  `[anonymize-sample] 已脱敏 ${out.length} 条 → public/sample-items.json（${avidOrder.length} 个投稿，${ownersByFreq.length} 位UP主）`,
)
