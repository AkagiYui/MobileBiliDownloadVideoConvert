// 把 ffmpeg.wasm 的单线程 ESM core 从 node_modules 拷到 public/ffmpeg/，
// 供运行时经 toBlobURL 加载。core 体积较大（wasm ~31MB）且可由依赖复现，
// 因此不纳入 git，改由 postinstall 自动生成。
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = resolve(root, 'node_modules/@ffmpeg/core/dist/esm')
const outDir = resolve(root, 'public/ffmpeg')

if (!existsSync(resolve(srcDir, 'ffmpeg-core.wasm'))) {
  console.warn('[copy-ffmpeg-core] 未找到 @ffmpeg/core，跳过（请先安装依赖）。')
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  copyFileSync(resolve(srcDir, f), resolve(outDir, f))
}
console.log('[copy-ffmpeg-core] 已生成 public/ffmpeg/{ffmpeg-core.js,ffmpeg-core.wasm}')
