// noUncheckedIndexedAccess を入れたときに出る型エラーを、ファイルごとの件数で出す（テストは除く）。
// 0 件になったら tsconfig.app.json に "noUncheckedIndexedAccess": true を足す。
// 合計が上限（LIMIT）を超えたら落とす（CI でも流す）。直して減ったら LIMIT をその件数に下げる。
//   npm run lint:unchecked-index
import { spawnSync } from 'node:child_process'

const LIMIT = 105

const res = spawnSync('npx', ['tsc', '-p', 'tsconfig.app.json', '--noEmit', '--noUncheckedIndexedAccess'], { encoding: 'utf8' })
if (res.error || !res.stdout) {
  console.error('tsc を実行できませんでした', res.error ?? res.stderr)
  process.exit(1)
}
const counts = new Map()
for (const line of res.stdout.split('\n')) {
  const m = /^(src\/[^(]+)\(\d+,\d+\): error TS/.exec(line)
  if (!m || /\.test\.tsx?$/.test(m[1])) continue
  counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
}
const rows = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
for (const [file, n] of rows) console.log(`${String(n).padStart(4)}  ${file}`)
const total = rows.reduce((s, [, n]) => s + n, 0)
console.log(`${String(total).padStart(4)}  合計（${rows.length} ファイル）`)

if (total > LIMIT) {
  console.error(
    `\n上限 ${LIMIT} 件を超えました（+${total - LIMIT}）。足したコードの配列・Record の読み出しで undefined を確かめてください（\`arr[i]\` → \`arr[i] ?? …\` / \`.at(i)\` など）。`,
  )
  process.exit(1)
}
if (total < LIMIT) console.log(`\n上限 ${LIMIT} 件より減りました。scripts/lint/unchecked-index.mjs の LIMIT を ${total} に下げてください。`)
