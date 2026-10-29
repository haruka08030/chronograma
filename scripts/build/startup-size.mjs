// 起動時に読む JS（入口とその静的な import、`src/boot.tsx` とその静的な import）の合計を数え、上限を超えたら落とす。
// 言語の文言（locale-ja / locale-en）は数えない（表示する言語の分だけ後から読む）。
// ビルドの manifest を読むので、`vite build --manifest` の後に流す（CI でも流す）。
//   npx vite build --manifest && node scripts/build/startup-size.mjs [dist] [--list]
// 減らしたら LIMIT_GZIP_KB を下げる。増やすときは、起動時に要るものかを確かめてから上げる。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const LIMIT_GZIP_KB = 370

const args = process.argv.slice(2)
const outDir = args.find((a) => !a.startsWith('--')) ?? 'dist'
const list = args.includes('--list')

let manifest
try {
  manifest = JSON.parse(readFileSync(join(outDir, '.vite/manifest.json'), 'utf8'))
} catch {
  console.error(`${outDir}/.vite/manifest.json がありません。\`vite build --manifest\` で作ってください。`)
  process.exit(1)
}

const entries = Object.entries(manifest).filter(([key, c]) => c.isEntry || key === 'src/boot.tsx')
if (!entries.some(([key]) => key === 'src/boot.tsx')) {
  console.error('manifest に src/boot.tsx がありません（起動の分け方が変わったら、このスクリプトも直す）')
  process.exit(1)
}

const seen = new Set()
const visit = (key) => {
  if (seen.has(key)) return
  seen.add(key)
  for (const dep of manifest[key].imports ?? []) visit(dep)
}
for (const [key] of entries) visit(key)

const rows = [...seen]
  .map((key) => manifest[key].file)
  .filter((file) => file.endsWith('.js'))
  .map((file) => {
    const buf = readFileSync(join(outDir, file))
    return { file, raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length }
  })
  .sort((a, b) => b.gzip - a.gzip)

const kb = (n) => (n / 1000).toFixed(1)
if (list) for (const r of rows) console.log(`${kb(r.raw).padStart(8)} kB  ${kb(r.gzip).padStart(7)} kB gzip  ${r.file}`)
const raw = rows.reduce((s, r) => s + r.raw, 0)
const gzip = rows.reduce((s, r) => s + r.gzip, 0)
console.log(`起動時に読む JS: ${rows.length} ファイル ${kb(raw)} kB / gzip ${kb(gzip)} kB（上限 gzip ${LIMIT_GZIP_KB} kB）`)

if (gzip > LIMIT_GZIP_KB * 1000) {
  console.error(
    `上限を超えました。起動時に要らないもの（ログインしてから・開いてから使うもの）は import() で後から読んでください（--list でファイルごとに出す）。`,
  )
  process.exit(1)
}
