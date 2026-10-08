// noUncheckedIndexedAccess を入れたときに出る型エラーを、ファイルごとの件数で出す（テストは除く）。
// 0 件になったら tsconfig.app.json に "noUncheckedIndexedAccess": true を足す。
//   npm run lint:unchecked-index
import { spawnSync } from 'node:child_process'

const res = spawnSync('npx', ['tsc', '-p', 'tsconfig.app.json', '--noEmit', '--noUncheckedIndexedAccess'], { encoding: 'utf8' })
const counts = new Map()
for (const line of res.stdout.split('\n')) {
  const m = /^(src\/[^(]+)\(\d+,\d+\): error TS/.exec(line)
  if (!m || /\.test\.tsx?$/.test(m[1])) continue
  counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
}
const rows = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
for (const [file, n] of rows) console.log(`${String(n).padStart(4)}  ${file}`)
console.log(`${String(rows.reduce((s, [, n]) => s + n, 0)).padStart(4)}  合計（${rows.length} ファイル）`)
