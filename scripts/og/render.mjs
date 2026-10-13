/**
 * リンクを共有したときのプレビュー画像（`public/og.png`、1200×630）を作る。
 *
 *   npm run og
 *
 * 白地に、アイコン・名前・何のアプリかの一文（#274 の短い形）と、
 * 予定と記録が並んでずれが見える小さなタイムライン。色は予定タイル（gc-plan）と色の丸（gc-dot）の塗り方に合わせる。
 * 文言や見た目を変えたら、このファイルを直して作り直す。
 */
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const out = path.join(root, 'public/og.png')
const icon = await readFile(path.join(root, 'public/icons/icon.svg'), 'utf8')

const SURFACE = '#ffffff'
const INK = '#1f1f1f'
/** gc-plan: 薄い塗り＋縁、gc-dot: 少し濃い塗り＋その色の縁（src/index.css） */
const plan = (c) =>
  `background:color-mix(in srgb, ${c} 14%, ${SURFACE});border:2px solid color-mix(in srgb, ${c} 45%, ${SURFACE});color:color-mix(in srgb, ${c} 55%, ${INK})`
const done = (c) => `background:color-mix(in srgb, ${c} 30%, ${SURFACE});border:2px solid ${c};color:color-mix(in srgb, ${c} 40%, ${INK})`

const HOUR = 64
const FIRST = 9
/** [列, 開始, 終了, 色, 名前] — 予定より遅れて始まり、長引いた記録 */
const blocks = [
  ['plan', 9, 10.5, '#4285f4', '課題'],
  ['plan', 11, 12, '#7986cb', 'ES'],
  ['plan', 13, 14, '#33b679', '授業'],
  ['done', 9.5, 11.25, '#4285f4', '課題'],
  ['done', 11.5, 12, '#7986cb', 'ES'],
  ['done', 13, 14, '#33b679', '授業'],
]
const hours = [9, 10, 11, 12, 13, 14]

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
* { box-sizing: border-box; margin: 0 }
body { width: 1200px; height: 630px; background: ${SURFACE}; color: ${INK};
  font-family: 'Hiragino Sans', 'Noto Sans JP', 'Helvetica Neue', sans-serif; display: flex; align-items: center; padding: 0 88px; gap: 72px }
.left { flex: 1 }
.icon { width: 96px; height: 96px; margin-bottom: 36px }
.icon svg { width: 100%; height: 100% }
h1 { font-size: 76px; font-weight: 700; letter-spacing: -0.02em; line-height: 1 }
p { margin-top: 26px; font-size: 32px; white-space: nowrap; font-weight: 500; color: #5f6368; line-height: 1.4 }
.tl { position: relative; width: 420px; height: ${HOUR * hours.length + 40}px }
.head { position: absolute; top: 0; font-size: 20px; color: #70757a; width: 170px; text-align: center }
.grid { position: absolute; left: 0; right: 0; border-top: 1px solid #e8eaed }
.hour { position: absolute; left: 0; width: 56px; font-size: 18px; color: #70757a; transform: translateY(-50%); background: ${SURFACE}; padding-right: 8px; text-align: right }
.b { position: absolute; border-radius: 8px; padding: 6px 12px; font-size: 22px; font-weight: 600; width: 168px }
</style></head><body>
<div class="left">
  <div class="icon">${icon}</div>
  <h1>Chronograma</h1>
  <p>予定と実際のずれが見える時間割</p>
</div>
<div class="tl">
  <div class="head" style="left:68px">予定</div>
  <div class="head" style="left:248px">記録</div>
  ${hours.map((h) => `<div class="grid" style="top:${40 + (h - FIRST) * HOUR}px;left:64px"></div><div class="hour" style="top:${40 + (h - FIRST) * HOUR}px">${h}:00</div>`).join('')}
  ${blocks
    .map(([col, s, e, c, name]) => {
      const top = 40 + (s - FIRST) * HOUR + 2
      const height = (e - s) * HOUR - 4
      return `<div class="b" style="left:${col === 'plan' ? 68 : 248}px;top:${top}px;height:${height}px;${col === 'plan' ? plan(c) : done(c)}">${height >= 40 ? name : ''}</div>`
    })
    .join('')}
</div>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html)
await page.screenshot({ path: out })
await browser.close()
console.log(`wrote ${path.relative(root, out)}`)
