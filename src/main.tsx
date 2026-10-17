import './index.css'
import { reloadForStaleChunk } from './lib/chunkLoad'
import { openDataStore } from './lib/dataStore'
import { startAfterDataLoaded } from './lib/startAfterDataLoaded'
import { loadSupabase, needsSupabaseAtStart } from './lib/supabase'

// デプロイ後に古いタブで別画面を開くと、古いファイル名がもう無くて読み込みに失敗する。
// 1 回だけ読み込み直して新しい版にする（失敗し続けるときに再読み込みを繰り返さないよう、1 分は空ける。
// オフラインでは読み込み直さない）。読み込み直さないときは `lazyNamed` が次に開くときに取り直す
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForStaleChunk()) event.preventDefault()
})

// ログインしている人は、Supabase（約 186 kB）の読み込みを端末のデータの読み込みと同時に始める（#446）。
// 前は画面を描いてから読み始めていた。Supabase はストアに触れないので先に読んでよい。
// 失敗しても、ログインの処理（AuthContext）がもう一度読む
if (needsSupabaseAtStart()) void loadSupabase().catch(() => {})

// 端末の保存データ（IndexedDB）を読み終えてから、ストア・同期・画面を読み込む。
// 先にストアを作ると空のデータで始まり、画面の書き込みが保存を上書きしたり、同期がサーバーの行を消したりする
void startAfterDataLoaded(openDataStore, () => import('./boot'))
