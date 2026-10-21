import './index.css'
import { renderBootFailure } from './lib/bootFailure'
import { dataStoreUnavailable, openDataStore } from './lib/dataStore'
import { blockPersisting } from './lib/persistStorage'
import { installGlobalErrorReporting, reportError } from './lib/errorReport'
import { startAfterDataLoaded } from './lib/startAfterDataLoaded'
import { loadSupabase, needsSupabaseAtStart } from './lib/supabase'

// 拾われなかったエラーを記録する（ログイン中だけ送る。`client_errors`）。起動の途中で落ちても残るよう、最初に付ける
installGlobalErrorReporting()

// 先読み（`vite:preloadError`）の失敗ではここで読み込み直さない（打っている途中の内容が消える）。
// 失敗は読み込んだ側に返り、利用者が開いたものだけ `lazyNamed` が読み込み直すかを決める

// ログインしている人は、Supabase（約 186 kB）の読み込みを端末のデータの読み込みと同時に始める（#446）。
// 前は画面を描いてから読み始めていた。Supabase はストアに触れないので先に読んでよい。
// 失敗しても、ログインの処理（AuthContext）がもう一度読む
if (needsSupabaseAtStart()) void loadSupabase().catch(() => {})

// 端末の保存データ（IndexedDB）を読み終えてから、ストア・同期・画面を読み込む。
// 先にストアを作ると空のデータで始まり、画面の書き込みが保存を上書きしたり、同期がサーバーの行を消したりする。
// 本体が読めなかったら、素の画面で「起動できませんでした」と再読み込みを出す
// データを置いている IndexedDB を開けなかったら、空のまま書き始めない（保存も同期も止め、バナーで再読み込みを促す）
void startAfterDataLoaded(
  async () => {
    await openDataStore()
    if (dataStoreUnavailable()) blockPersisting('unavailable')
  },
  () => import('./boot'),
  (err) => {
    console.error('[boot]', err)
    reportError('chunk', err, { component: 'boot' })
    const root = document.getElementById('root')
    if (root) renderBootFailure(root)
  },
)
