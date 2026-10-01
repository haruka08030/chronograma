# Chronograma 改善タスク

辛口レビュー（2026-09-30）を、着手できる単位に割ったもの。
**原則**は [[chronograma-ux-principles]]（記録が主役 / 締切は焦らせてよい / ごちゃつかせない /
性質の違うものを混ぜない / Google カレンダー準拠 / 想定ユーザーは学生・就活生 / PC 優先 + PWA）。

各タスクは「1 コミットで終わる」粒度。完了したら行を消す。

---

## 前提：レビュー時点から既に直っていたもの（再指摘しない）

読み直して確認した。以下は **対応済み**なので、タスクには入れない。

| 項目 | 現状 | 根拠 |
|---|---|---|
| 同期が黙ってデータを消す | 三方向マージ済み。baseline との差分で `deletes` を作る | `src/hooks/useSupabaseSync.ts:18-21`, `src/lib/syncMerge.ts:85-125` |
| 起動時の画面が空の Inbox | `selectedView: 'planner'` が初期値 | `src/store/taskStore.ts:579` |
| 空状態が「ありません」の一言 | Today / いつか / 習慣に本文付きの空状態 | `src/locales/ja.ts:120-121, 216, 317` |
| クイック追加のパーサが貧弱 | 曜日・時刻・範囲・長さまで解釈（197 行） | `src/lib/parseQuickAdd.ts` |
| 他端末の変更が入ってこない | 60 秒ポーリング + visibility/focus で再同期 | `src/hooks/useSupabaseSync.ts:145-152` |
| 初期リストが 1 つで Wish と混ざる | 「いつか」「買い物」を `kind` 付きで最初から分離 | `src/store/taskStore.ts:344-354` |

---

## P0 — 信頼性（これが無いと毎日は預けられない）

> **T1–T4 は完了**（`22b96ae` テスト / `e673ecb` CI / `b7a32c8` 同期の状態と再送）。
> 残っているのは P1 以降。

### ~~T1.~~ （完了） 同期の状態を UI に出す
いま `console.error('[sync]', ...)` に消えていて、ユーザーは
**成功したのか失敗したのか永久にわからない**。クラウドに預ける判断ができない。

- `taskStore` に `syncState: 'idle' | 'syncing' | 'error'` と `lastSyncedAt: string | null` を追加
- `useSupabaseSync` の `syncOnce` の各分岐で set（`console.error` は残す）
- サイドバーのアカウントボタン脇に小さいドット 1 個。`title` に「3 分前に同期」
- **エラー時だけ**文言を出す。成功時は常時表示しない（原則 3: ごちゃつかせない）
- ja / en 両方

**触る:** `src/store/taskStore.ts`, `src/hooks/useSupabaseSync.ts`, `src/components/Sidebar.tsx`, `src/locales/*.ts`

### ~~T2.~~ オフライン時の push リトライ（完了）
`syncOnce` が失敗したら **そこで終わり**。次のローカル編集まで再送されない。
地下鉄で編集 → 浮上しても同期されない、が起きる。

- 失敗を `pendingSync` フラグで持つ
- `window.addEventListener('online')` で `sync()`
- 失敗中は指数バックオフ（10s → 30s → 60s、上限 60s）で再試行
- T1 の `syncState: 'error'` と接続する

**触る:** `src/hooks/useSupabaseSync.ts`

### ~~T3.~~ syncMerge のテストを書く（完了: vitest 43 件）
`syncMerge.ts` はデータ消失を防ぐ**最後の砦**なのに、テストが 1 本も無い（`NO TEST RUNNER`）。
T1・T2 を入れる前にここを固めないと、直したつもりで壊す。

- `vitest` を devDependency に追加、`npm test`
- `mergeSnapshots` のケース: 片側追加 / 両側編集（新しい `updatedAt` が勝つ）/
  片側削除 + 他方編集 / baseline に無い ID / 空 baseline
- `parseQuickAdd` のケースも同時に（曜日・時刻・範囲・長さ・タイトルに戻る語）

**触る:** `package.json`, `src/lib/syncMerge.test.ts`, `src/lib/parseQuickAdd.test.ts`

### ~~T4.~~ CI を足す（完了）
`.github/workflows` が無い。`npm run lint` / `npm run build` / `npm test` を PR で回すだけ。
T3 が入った直後にやる。

**触る:** `.github/workflows/ci.yml`

---

## P1 — 毎日の使用感

### ~~T5.~~ タイマーの取り残しを回収する（完了 `69005a1`）
`startTimer` は実行中タイマーを**確認なしで捨てる**（`taskStore.ts:1203`）。
`stopTimer` を呼ばずにタブを閉じると、次に開いたとき 8 時間走っているタイマーが出る。
記録が主役（原則 1）のアプリで、記録が汚れるのは致命的。

- `startTimer` が実行中を検出したら「前のを止めて開始」
- 起動時 `activeTimer.startedAt` が 8 時間超 →
  「まだ計測中ですか？ 止める / 続ける / この時刻で終了」
- 原則 3 に従い、**閾値を超えたときだけ**出す

**触る:** `src/store/taskStore.ts`, `src/components/FloatingTimer.tsx`, `src/locales/*.ts`

### ~~T6.~~ Undo を削除以外にも広げる（完了 `d3e8d37`）
`⌘Z` は `undoLastOperation()` → `undoDelete()` の 2 段（`App.tsx:390-404`）だが、
トーストは削除専用。**どの操作が取り消せるのか境界が見えない**。

- `UndoToast` を汎用化し、`pushUndo()` が走る操作でトーストを出す
- 特に **一括操作・セクション削除・リスト移動**は必ず出す
- 出しっぱなしにしない（数秒で消す）

**触る:** `src/components/UndoToast.tsx`, `src/store/taskStore.ts`

### ~~T7.~~ インポートの全置換をガードする（完了 `2d2781b`）
`settings.backupHint` は「現在のデータを全て置き換えます」と書いてあるが、
**設定画面に平置き**で、確認は一律メッセージのみ。1 回の誤操作で全消失する。

- 置換前に自動で現データを JSON バックアップ（ダウンロードではなく直前復元用に保持）
- 確認ダイアログに「タスク N 件 → M 件 に置き換えます」と**件数**を出す
- 実行後に「元に戻す」を一定時間出す（T6 の仕組みに乗せる）

**触る:** `src/components/SettingsView.tsx`, `src/lib/backupFormat.ts`, `src/locales/*.ts`

---

## P2 — 磨き

### ~~T8.~~ 通知が「タブを開いている間だけ」問題（完了 `022d6d7`）
`App.tsx:466` の `setInterval` ベース。タブを閉じたら通知は来ない。
`public/sw.js` は既にあるので PWA の土台はある。

**調べたら前提が変わっていた**: 朝・夕方の通知と予定のリマインダーは既に
Web Push 実装済み（`src/lib/webPush.ts` + `daily-reminders` Edge Function）で、
アプリを閉じていても届く。タブ依存なのは **締切の通知だけ**（`checkAndNotify`）。

→ 説明文がその差を伝えていなかったので、まず正直に書いた。
締切通知も push にするかは別途判断（`push_subscriptions` に行を足す必要あり）。

**触る:** `public/sw.js` or `src/locales/*.ts`

### ~~T9.~~ タッチのドラッグ開始 280ms（完了 `2c9d9de`）
競合しないことを確認した: ドラッグを始められるのは 4 か所すべて専用のつまみ
（`touch-none` の ⋮⋮ ボタン）だけで、行には付いていない。行の長押し一括選択は
TaskItem の 450ms で別に拾う。→ 待ち時間は純粋な遅延だったので **140ms** に。

**触る:** `src/App.tsx`

### ~~T10.~~ 12 ビューの初回説明（不要になった）
**前提が消えた**。`b092779` で「予定と記録」と「活動ログ」が Today と
カレンダーに統合され、紛らわしかった 2 画面そのものが無くなった。
サイドバーは 今日 / カレンダー / 習慣 / 統計 の 4 本だけで、
初見で迷う組み合わせが残っていない。

統計の空状態も検討したが、`WeekReviewCard` の `insightEmpty`
（「この週はまだ記録がありません。『今日の計画』で 1 つだけ…」）が
既に同じ案内を出しており、足すと原則 3 の「同じ情報を重複表示しない」に
反するのでやめた。

**触る:** `src/components/PlanVsActualView.tsx`, `src/components/ActivityLogView.tsx`, `src/locales/*.ts`

---

## 進め方の提案

1. ~~**T3 → T4** でまず土台（テスト + CI）~~ 完了
2. ~~**T1 → T2** で同期の信頼性~~ 完了
3. ~~**T5 → T6 → T7** で毎日の使用感~~ 完了
4. ~~T8 / T9 / T10~~ 完了（T10 は画面統合で不要に）

**このリストは消化済み。** 次に取るなら、レビュー時点では挙げていなかった
以下が候補:

- **画面確認の自動化**: 原則 9 の「自分で見て確かめる」が仕組みとして無い。
  Playwright を入れて デスクトップ / スマホ / ダーク の撮影を 1 コマンドにする。
  T1・T5・T6・T7 は今も**目視未確認**のまま
- **締切通知も Web Push に寄せる**（T8 の続き。`push_subscriptions` に
  締切ぶんの行を足す必要がある）
- **`taskStore.ts` の分割**: 2,000 行超・1 ファイルに全アクション。
  テストを足したい箇所（繰り返しの次回生成、習慣の記録化）が
  localStorage と i18n に依存していて単体で触れない

### 残っている確認（正直に）

T1 の見た目は**画面で未確認**。同期インジケータはログイン中のみ出るため、
ログインしないと再現できない。ロジック（相対表記・状態遷移）は
`src/components/syncIndicatorLabel.test.ts` で固めてある。
ログインして次を確認したい:

- 通常時にドットが出ない（＝うるさくない）
- 機内モードで編集 → 「未同期」が出る → 解除で消える
- ライト / ダーク / スマホ幅で崩れない

原則 9 に従い、UI を触る T1・T5・T6・T7・T10 は
**Playwright でデスクトップ / スマホ / ダークを撮ってから完了**とする。
