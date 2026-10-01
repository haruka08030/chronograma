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

### T5. タイマーの取り残しを回収する
`startTimer` は実行中タイマーを**確認なしで捨てる**（`taskStore.ts:1203`）。
`stopTimer` を呼ばずにタブを閉じると、次に開いたとき 8 時間走っているタイマーが出る。
記録が主役（原則 1）のアプリで、記録が汚れるのは致命的。

- `startTimer` が実行中を検出したら「前のを止めて開始」
- 起動時 `activeTimer.startedAt` が 8 時間超 →
  「まだ計測中ですか？ 止める / 続ける / この時刻で終了」
- 原則 3 に従い、**閾値を超えたときだけ**出す

**触る:** `src/store/taskStore.ts`, `src/components/FloatingTimer.tsx`, `src/locales/*.ts`

### T6. Undo を削除以外にも広げる
`⌘Z` は `undoLastOperation()` → `undoDelete()` の 2 段（`App.tsx:390-404`）だが、
トーストは削除専用。**どの操作が取り消せるのか境界が見えない**。

- `UndoToast` を汎用化し、`pushUndo()` が走る操作でトーストを出す
- 特に **一括操作・セクション削除・リスト移動**は必ず出す
- 出しっぱなしにしない（数秒で消す）

**触る:** `src/components/UndoToast.tsx`, `src/store/taskStore.ts`

### T7. インポートの全置換をガードする
`settings.backupHint` は「現在のデータを全て置き換えます」と書いてあるが、
**設定画面に平置き**で、確認は一律メッセージのみ。1 回の誤操作で全消失する。

- 置換前に自動で現データを JSON バックアップ（ダウンロードではなく直前復元用に保持）
- 確認ダイアログに「タスク N 件 → M 件 に置き換えます」と**件数**を出す
- 実行後に「元に戻す」を一定時間出す（T6 の仕組みに乗せる）

**触る:** `src/components/SettingsView.tsx`, `src/lib/backupFormat.ts`, `src/locales/*.ts`

---

## P2 — 磨き

### T8. 通知が「タブを開いている間だけ」問題
`App.tsx:466` の `setInterval` ベース。タブを閉じたら通知は来ない。
`public/sw.js` は既にあるので PWA の土台はある。

- 方針を決める: Service Worker で本当に出すのか、諦めて**設定画面で正直に書く**のか
- リマインダーとして期待させるなら前者。工数が重いなら後者を先に（誠実さのほうが大事）

**触る:** `public/sw.js` or `src/locales/*.ts`

### T9. タッチのドラッグ開始 280ms
`App.tsx` の `TouchSensor delay: 280`。スマホで並べ替えるたび 0.3 秒待つ。
長押し選択（`ebbf419` で入った）と競合していないか確認した上で 180-200ms に。
**競合するなら現状維持**で、このタスクは閉じる。

**触る:** `src/App.tsx`

### T10. 12 ビューの初回説明
`plan-vs-actual` と `activity-log` の違いは初見でわからない。
ただし原則 3（説明文を常時出さない）があるので、**モーダルのツアーは作らない**。

- 各ビューの**初回訪問時だけ**、上部に 1 行の説明バナー（閉じたら二度と出ない）
- 文言は原則 7 に合わせ、学生・就活生の例で

**触る:** `src/components/PlanVsActualView.tsx`, `src/components/ActivityLogView.tsx`, `src/locales/*.ts`

---

## 進め方の提案

1. ~~**T3 → T4** でまず土台（テスト + CI）~~ 完了
2. ~~**T1 → T2** で同期の信頼性~~ 完了
3. **T5 → T6 → T7** で毎日の使用感 ← 次はここ
4. P2 は余力で

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
