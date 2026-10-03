/**
 * 画面を撮る（原則 9「自分で画面を見て確かめる」を 1 コマンドにする）。
 *
 *   npm run shots              # 全画面 × デスクトップ/スマホ × ライト/ダーク
 *   npm run shots -- --only=planner,stats
 *   npm run shots -- --dark-only
 *   npm run shots -- --out=/tmp/shots
 *   npm run shots -- --at=19:30         # 時刻を変える（既定 13:00。--at=now で実時刻）
 *
 * 保存先の既定は `.shots/`（git 管理外）。
 * 毎回この作業ツリーをビルドし、空いているポートで自分のサーバーを起こして最後に止める。
 * （既に開いている 5173 を使い回すと、別の worktree や別の作業の画面を撮ってしまう）
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { buildSeedState, PERSIST_KEY } from './seed.mjs'

/** ここから順に空いているポートを探す（5173 は普段の dev サーバー用に空けておく） */
const FIRST_PORT = 5180

/**
 * 撮影するブラウザのタイムゾーン。種データの日付もこれで組み立てる
 * （ホストの時刻で作ると、日付が 1 日ずれて予定・記録がタイムラインから消える）
 */
const TIMEZONE = 'Asia/Tokyo'

/** `at` を決めていない画面を撮る時刻（TIMEZONE の今日） */
const DEFAULT_AT = '13:00'

/** 撮る画面。`view` は store の selectedView、`click` は撮る前に押すもの（配列なら順に）、`hover` は撮る前にマウスを乗せるもの（PC 幅だけ）、`at` は時刻を固定する（'HH:MM'、TIMEZONE の今日） */
const SCREENS = [
  { name: 'planner', view: 'planner' },
  // アイコンだけのボタンに乗せたときのヒント（aria-label を出す。スマホは出ない）
  { name: 'planner-tip', view: 'planner', click: 'button[aria-expanded]:has-text("やり残し")', hover: 'button[aria-label$="完了にする"] >> nth=0' },
  // 追加欄を押した状態（書き方のヒントは浮かせて出し、下の行を動かさない）
  { name: 'planner-add-hint', view: 'planner', click: 'input[data-quickadd]' },
  // タイムラインの予定の ✓ を押したとき（記録は足さず完了だけ）
  { name: 'planner-timeline-check', view: 'planner', click: 'button[aria-label="タスクを完了にする"] >> visible=true >> nth=-1' },
  // やり残しを開いた状態（行ごとの「今日やる」アイコン）
  { name: 'planner-left-over', view: 'planner', click: 'button[aria-expanded]:has-text("やり残し")' },
  // 夕方以降だけ出る「1 日を締める」行（残り・ラベルなしの記録・ふりかえる）
  { name: 'planner-evening', view: 'planner', at: '19:30', scrollToBottom: true },
  // 全部終わった日の締め（おつかれさまでした）
  { name: 'planner-evening-clear', view: 'planner', at: '19:30', scrollToBottom: true, allDone: true },
  // 夜中に開いたとき（日付が変わった直後のタイムライン）
  { name: 'planner-midnight', view: 'planner', at: '00:30' },
  // 見出しの期間を押したときの月のカレンダー（期限のカレンダーと同じ DatePickerBody）
  { name: 'calendar-date-jump', view: 'calendar', click: 'button[aria-label="日付を選択"]' },
  // タイムラインの予定を押したときのカード（右上の丸いアイコンボタン）
  { name: 'calendar-event-card', view: 'calendar', click: '[data-block-id="s6"] >> visible=true' },
  { name: 'todo', view: 'all' },
  // ナビから色ラベルを開いた状態（「すべて」を色で絞る）
  { name: 'todo-label', view: 'all', filterColor: '#F6BF26' },
  { name: 'calendar', view: 'calendar' },
  // 開いた状態でしか見えないもの: click のセレクタを押してから撮る
  { name: 'calendar-dock', view: 'calendar', click: 'button[aria-pressed]' },
  // タスク詳細（締切・時刻・タイムゾーン・繰り返し・リストの並び）
  // タイトルを押すと編集になるので、行の左の余白を押して開く
  { name: 'task-detail', view: 'all', click: 'div.group.cursor-pointer:has-text("ES 書く（第一志望）")', clickAt: { x: 4, y: 12 } },
  { name: 'task-detail-scheduled', view: 'all', click: 'div.group.cursor-pointer:has-text("ゼミ"):not(:has-text("研究室"))', clickAt: { x: 4, y: 12 } },
  { name: 'habits', view: 'habits' },
  // 習慣の追加欄（色選びはラベル付きの色選び）
  { name: 'habits-add', view: 'habits', click: 'button:has-text("習慣を追加")' },
  // 習慣を追加するフォームで「週指定」を選んだ状態（曜日のピル）
  { name: 'habits-new-weekly', view: 'habits', click: ['button:has-text("習慣を追加") >> visible=true', 'label:has-text("週指定")'], scrollToBottom: true },
  { name: 'stats', view: 'stats' },
  { name: 'settings', view: 'settings' },
  { name: 'someday', list: 'seed-someday' },
  { name: 'checklist', list: 'seed-shopping' },
  // 行に乗せたとき（PC だけ）。いつかは締切の代わりに「予定する」
  { name: 'checklist-hover', list: 'seed-shopping', hover: '[data-task-row="s24"]' },
  { name: 'someday-hover', list: 'seed-someday', hover: '[data-task-row="s21"]' },
  // 行を右クリックしたときのメニュー（PC だけ。いつか・買い物はリストに合わせた短いメニュー）
  { name: 'someday-menu', list: 'seed-someday', rightClick: '[data-task-row="s21"]' },
  { name: 'checklist-menu', list: 'seed-shopping', rightClick: '[data-task-row="s24"]' },
  { name: 'checklist-menu-checked', list: 'seed-shopping', rightClick: '[data-task-row="s25"]' },
  // ゴミ箱・アーカイブの行の右クリック（deleted・archived の ID を撮るときだけ消した・しまった状態にする）
  { name: 'trash-menu', view: 'deleted', deleted: ['s20'], rightClick: 'div.group:has-text("就活サイトのプロフィール更新")' },
  { name: 'archive-menu', view: 'archived', archived: ['s20'], rightClick: 'div.group:has-text("就活サイトのプロフィール更新")' },
]

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
]

/**
 * そのタイムゾーンでの「いま」を、ローカル時刻として読める Date にする。
 * 種データは `getFullYear()` などローカル時刻の API で日付を作るので、
 * ブラウザ側と同じ暦日にそろえないと予定・記録が別の日に置かれる。
 */
function nowInTimeZone(timeZone, instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(instant)
  const get = (t) => Number(parts.find((p) => p.type === t).value)
  return new Date(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
}

/** TIMEZONE で今日の `at`（'HH:MM'）にあたる実時刻 */
function instantAt(at, timeZone) {
  const now = new Date()
  const local = nowInTimeZone(timeZone, now)
  const [h, m] = at.split(':').map(Number)
  const target = new Date(local)
  target.setHours(h, m, 0, 0)
  return new Date(now.getTime() + (target.getTime() - local.getTime()))
}

function parseArgs(argv) {
  // 時刻を決めないと、撮るたびに「過ぎた予定」「現在線」が動いて見比べられない。既定は昼
  const out = { only: null, themes: ['light', 'dark'], outDir: '.shots', at: DEFAULT_AT }
  for (const a of argv) {
    if (a.startsWith('--only=')) out.only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--dark-only') out.themes = ['dark']
    else if (a === '--light-only') out.themes = ['light']
    else if (a.startsWith('--out=')) out.outDir = a.slice(6)
    else if (a.startsWith('--at=')) out.at = a.slice(5) === 'now' ? null : a.slice(5)
  }
  return out
}

function portFreeOn(port, host) {
  return new Promise((resolve) => {
    const s = createServer()
    s.once('error', () => resolve(false))
    s.once('listening', () => s.close(() => resolve(true)))
    s.listen(port, host)
  })
}

/** IPv4・IPv6 のどちらでも空いているポート（Vite は localhost＝::1 で待ち受けることがある） */
async function findFreePort() {
  for (let port = FIRST_PORT; port < FIRST_PORT + 50; port++) {
    if ((await portFreeOn(port, '127.0.0.1')) && (await portFreeOn(port, '::1'))) return port
  }
  throw new Error(`${FIRST_PORT} 以降に空いているポートがありません`)
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      /* まだ起きていない */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { cwd: process.cwd(), stdio: 'ignore' })
    c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} が失敗しました`))))
    c.on('error', reject)
  })
}

/**
 * 本番ビルドを配信して撮る。dev サーバーだと `import.meta.env.DEV` の
 * 開発者向け表示（Google OAuth の設定手順など）が写り込み、
 * 利用者が見る画面と違ってしまう。
 */
async function startServer() {
  console.log('→ ビルドします')
  await run('npm', ['run', 'build'])
  const port = await findFreePort()
  const baseUrl = `http://localhost:${port}`
  console.log(`→ プレビューサーバーを起動します（${baseUrl}）`)
  const child = spawn('npm', ['run', 'preview', '--', '--port', String(port), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: false,
  })
  if (!(await waitForServer(baseUrl))) {
    child.kill('SIGTERM')
    throw new Error('プレビューサーバーが起動しませんでした')
  }
  return { child, baseUrl }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const screens = args.only
    ? SCREENS.filter((s) => args.only.includes(s.name))
    : SCREENS
  if (screens.length === 0) {
    throw new Error(`--only に一致する画面がありません。使えるのは: ${SCREENS.map((s) => s.name).join(', ')}`)
  }

  const outDir = path.resolve(process.cwd(), args.outDir)
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const server = await startServer()
  const browser = await chromium.launch()
  let shot = 0
  const failures = []

  try {
    for (const theme of args.themes) {
      for (const vp of VIEWPORTS) {
        for (const screen of screens) {
          // 画面ごとに context を作り直す。addInitScript は context に積み上がるので、
          // 使い回すと前の画面の種データが後から上書きしてしまう
          const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            isMobile: vp.isMobile ?? false,
            hasTouch: vp.hasTouch ?? false,
            // 2x は文字が読みやすい反面、固定サイドバーの左端に描画の切れ端が
            // 残ることがある（アプリ側の不具合ではない）。気になるときは 1 にする
            deviceScaleFactor: 2,
            colorScheme: theme,
            locale: 'ja-JP',
            timezoneId: TIMEZONE,
            // 時刻で構図が動く画面（タイムラインの現在線）を落ち着かせる
            reducedMotion: 'reduce',
          })

          const at = screen.at ?? args.at
          const instant = at ? instantAt(at, TIMEZONE) : new Date()
          // アプリと同じく、朝 4 時までは前の日を「今日」として種を置く（timeZone.ts の DAY_START_HOUR）
          const seedNow = nowInTimeZone(TIMEZONE, instant)
          if (seedNow.getHours() < 4) seedNow.setDate(seedNow.getDate() - 1)
          const seed = buildSeedState({ theme, now: seedNow })
          // selectView と同じく、ビューを開くときはリストの選択を外す
          if (screen.view) {
            seed.state.selectedView = screen.view
            seed.state.selectedListId = null
          }
          if (screen.allDone) {
            for (const x of seed.state.tasks) if (!['seed-someday', 'seed-shopping'].includes(x.listId)) x.completed = true
          }
          if (screen.filterColor) seed.state.filterColor = screen.filterColor
          for (const x of seed.state.tasks) {
            if (screen.deleted?.includes(x.id)) x.deletedAt = seedNow.toISOString()
            if (screen.archived?.includes(x.id)) x.archivedAt = seedNow.toISOString()
          }
          if (screen.list) {
            seed.state.selectedView = null
            seed.state.selectedListId = screen.list
          }
          // アプリが動き出す前に仕込む。goto してから書くと、起動した store が
          // 作りたての state を先に保存してしまい、種データが上書きされる
          await context.addInitScript(
            ([key, value]) => {
              try {
                window.localStorage.setItem(key, value)
                window.localStorage.setItem('chronograma-lang', 'ja')
              } catch {
                /* 読めない環境ではそのまま進む */
              }
            },
            [PERSIST_KEY, JSON.stringify(seed)],
          )

          const page = await context.newPage()
          if (at) await page.clock.setFixedTime(instant)
          const consoleErrors = []
          page.on('console', (m) => {
            if (m.type() === 'error') consoleErrors.push(m.text())
          })
          page.on('pageerror', (e) => consoleErrors.push(String(e.message ?? e)))

          try {
            await page.goto(server.baseUrl, { waitUntil: 'networkidle' })
            // Zustand の復元とフォントの反映を待つ
            await page.waitForTimeout(600)
            if (screen.click) {
              // 配列なら順に押す（フォームを開いてから中の選択肢を押す、など）。clickAt は最初の 1 つだけ
              const clicks = Array.isArray(screen.click) ? screen.click : [screen.click]
              for (const [i, sel] of clicks.entries()) {
                await page.click(sel, i === 0 && screen.clickAt ? { position: screen.clickAt } : undefined)
                await page.waitForTimeout(300)
              }
            }
            if (screen.hover && !vp.hasTouch) {
              // マウスを乗せたときのヒント（TooltipHost は 0.5 秒後に出す）
              await page.hover(screen.hover)
              await page.waitForTimeout(800)
            }

            if (screen.rightClick && !vp.hasTouch) {
              await page.click(screen.rightClick, { button: 'right' })
              await page.waitForTimeout(300)
            }

            if (screen.scrollToBottom) {
              // 内側のペインがスクロールするので、スクロールできる要素をすべて下まで送る
              await page.evaluate(() => {
                for (const el of document.querySelectorAll('*')) {
                  if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = el.scrollHeight
                }
              })
              await page.waitForTimeout(200)
            }

            const file = path.join(outDir, `${screen.name}-${vp.name}-${theme}.png`)
            // アプリは body が overflow:hidden で、スクロールするのは内側のペイン。
            // fullPage を使うと固定サイドバーが縦に継ぎ足されて見た目が壊れるので使わない
            await page.screenshot({ path: file })
            shot++
            const errs = consoleErrors.filter(
              // Supabase 未設定・SW 未登録はローカル撮影では当然出るので無視
              (e) => !/supabase|service ?worker|manifest|favicon|VAPID/i.test(e),
            )
            const mark = errs.length > 0 ? ` ⚠ console: ${errs[0].slice(0, 80)}` : ''
            if (errs.length > 0) failures.push(`${screen.name}/${vp.name}/${theme}: ${errs[0]}`)
            console.log(`  ✓ ${path.basename(file)}${mark}`)
          } catch (err) {
            failures.push(`${screen.name}/${vp.name}/${theme}: ${err.message}`)
            console.log(`  ✗ ${screen.name}-${vp.name}-${theme}: ${err.message}`)
          } finally {
            await page.close()
            await context.close()
          }
        }
      }
    }
  } finally {
    await browser.close()
    server.child.kill('SIGTERM')
    console.log('→ サーバーを止めました')
  }

  console.log(`\n${shot} 枚を ${path.relative(process.cwd(), outDir)}/ に保存しました`)
  if (failures.length > 0) {
    console.log(`\n気になった点 (${failures.length}):`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
