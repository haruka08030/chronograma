# Chronograma

予定と実際を同じタイムラインに並べて、時間がどこに溶けたか分かる時間割。

## プロジェクト概要

**Chronograma** は学生向けの **React** のシングルページアプリ（PWA）です。
1日を計画して、記録して、ふりかえります。

### 主役: 計画 → 記録 → ふりかえり

- **今日の計画**（既定の画面）: 今日のやり残し・今日やること・習慣を左に、1 日のタイムラインを右に置き、ドラッグや「15時 レポート 1時間」のような入力で時間に置く。1 日の区切りは 0 時で、前の日に終わらなかった予定は今日のやり残しに繰り越す
- **記録**: 行の ▶ で記録を始めると、タイムラインの予定の横に実際の記録が並び、予定とのずれが見える。記録の名前は過去の記録・その時間に重なる予定・今日の To-Do から候補を出し、選ぶとラベルや時間が入る
- **ふりかえり**: 予定 vs 実績・活動ログ・統計（日・週・月）、夜のまとめ（その日の予定と記録のずれの数字）

### その他にできること

- **To‑Do**:
  ラベル（記録・カレンダーと共通の色の名前）で分ける。期限・時刻・繰り返し、検索・クイック追加、ドラッグでの並べ替え、複数選択と一括操作、直近削除の
  Undo
- **いつか**: 夢とやりたいを切り替えて見る。夢は 2
  列のタイル（次の一歩・進み具合、かなえた夢は日付つきで残る）、やりたいは行の棚と「今週これどう？」。夢の一歩を予定にしても元の夢を覚える
- **チェックリスト**:
  ラベルとは別のリスト（買い物など）。いつかとともに今日の計画・期限・統計・通知に混ざらない。クイック追加で
  `@買い物 牛乳` のように追加先を指定
- **カレンダー**: 月／週／3
  日／スケジュール表示、時間割（授業を学期の間の毎週の予定に）、よく入れる予定、日付パネルでその日の予定・記録を確認
- **習慣**:
  ヒートマップ・週次スコア・曜日トグル・時間指定モード（なし／固定時刻／時間帯）など
- **連携（任意）**: Google
  カレンダー（取り込みと、アプリの予定の書き込み）・Notion・Canvas
- **外観**: ライト／ダーク、日本語と英語の UI

**既定の保存先**はブラウザの **IndexedDB**（Zustand
の永続化。使えないブラウザでは localStorage）です。**Supabase**
を環境変数で設定すると、**Google
アカウント**かメール（届いたリンク、またはコードの入力）でログインし、リスト・タスク・習慣を
**クラウド同期**できます。未設定のときは認証なしのローカル専用動作です。

**スマホ・タブレット**も同じ Web
アプリで対応しています（**PWA**）。ホーム画面に追加するとアプリとして起動でき、ログイン中は通知がアプリを閉じていても届きます。以前あった
Flutter 版（`mobile/`）は廃止しました（Git 履歴には残っています）。

実装寄りの全体像（主要ファイル、同期の挙動、マイグレーション一覧など）は
[`doc/ARCHITECTURE.md`](doc/ARCHITECTURE.md)
を参照してください。人に公開するときの手順は
[`doc/PUBLISHING.md`](doc/PUBLISHING.md)。作業は GitHub の
Issue、アイデアと方向性は [`doc/IDEAS.md`](doc/IDEAS.md)、実装で守る決まりは
[`doc/RULES.md`](doc/RULES.md) です。

## 設計の全体像（Architecture）

**手元が先（local-first）**。画面はいつも端末のストアを読み書きし、サーバーへの同期は後ろで行います。オフラインでも全部の操作ができます。

| 層 | しくみ | 主なファイル |
| --- | --- | --- |
| 状態 | Zustand のストア 1 つを役割ごとの slice（tasks・lists・sections・habits・timeLogs・settings・ui など）に分ける。行は購読する値だけを選ぶ（`memo` とセレクタ） | `src/store/taskStore.ts`、`src/store/slices/` |
| 端末への保存 | `persist` で IndexedDB へ（使えないブラウザでは localStorage。前の版の localStorage のデータは初回に 1 回だけ移す）。本体と前回同期の控えは 1 つのトランザクションで書き、他のタブには BroadcastChannel で知らせる。保存する値を DATA / VIEW / TRANSIENT に分け、版番号（`STORE_VERSION`）ごとに段階的に移行する。読めない保存データは上書き前に退避する。端末の中の自動バックアップ（毎日 14 日分など） | `src/lib/dataStore.ts`、`persistKeys.ts`、`migrate.ts`、`src/lib/autoBackup.ts` |
| 同期 | 端末ごとの前回同期の控えとの**三方向マージ**。書き込みは「もとにしたサーバーの版」を付けて送り、サーバーのトリガーが版を確かめてサーバーの時刻を付ける（端末の時計に頼らない）。ふだんの取り込みは**差分**（`updated_at` が前回より新しい行と、削除の記録 `sync_tombstones`）。起動時・6 時間ごと・断られた後は全件 | `src/lib/syncMerge.ts`、`syncPull.ts`、`supabaseData.ts`、`src/hooks/useSupabaseSync.ts` |
| サーバー | Supabase（Postgres + RLS で本人の行だけ）。外部サービスのトークンは Edge Function が暗号化して持ち、ブラウザには出さない。通知は pg_cron が 5 分ごとに Edge Function `daily-reminders` を呼ぶ | `supabase/migrations/`、`supabase/functions/` |
| 画面と URL | ルーターは使わず、ストアの画面の状態を URL（`?view=` / `?list=`）に写して履歴に積む。ブラウザ・スマホの「戻る」が効く | `src/lib/viewUrl.ts`、`urlHistory.ts` |
| 読み込み | 「今日の計画」以外の画面と、開いたときだけ要る詳細・メニューは遅延読み込み。読めなければ次に開くときに読み直す | `src/lib/lazyComponent.ts`、`src/components/lazyOverlays.ts` |
| エラー | 画面・同期・端末の保存・連携・通知の購読のエラーを Supabase の `client_errors` に送る（ログインしていない間はためておき、ログインしたら送る。同じエラーはまとめ、トークンやメールは伏せる。30 日で消える。見る SQL は `supabase/metrics/health.sql`）。Edge Function の中のエラーは Supabase の Edge Functions → Logs | `src/lib/errorReport.ts` |
| 問い合わせ | 設定の一番下から、ログインしている人が文面を Supabase の `feedback` に送る（端末からは送るだけで読めない。1 人 24 時間に 20 件まで） | `src/lib/feedback.ts` |
| 数を見る | 本番の SQL Editor で流す読むだけの SQL。エラーと通知の回（`health.sql`）、同期している版（`versions.sql`）、使われ方（`usage.sql`: 使い始めた人（最初の行から 3 日のうちに、同じ日に予定と記録が並んだ日がある）・続けている人（7〜13 日目にその日が 2 日以上）・記録した日の数・機能ごとの人数と 2 週目も使った人・予定と記録の比・ラベルの無い記録の割合。数と日付だけで、タイトル・メモ・ラベル名は読まない。作った人・試しのアカウントは `auth.users` の app_metadata `metrics_exclude` で外す）。migration には入れない | `supabase/metrics/` |

**テスト**: 計算・同期・保存の移行は vitest（node）、画面の部品は vitest + Testing Library（jsdom）、起動から使う流れは Playwright、RLS とトリガーは pgTAP（`supabase/tests/`）。CI（`.github/workflows/ci.yml`）は型・Lint（a11y 込み）・書式・テスト・E2E に加え、Edge Function の型チェックと、ローカルの Supabase に migration を全部流して pgTAP を回します。

## ローカルで動かす（Web）

プロジェクトルートで依存関係を入れたうえで開発サーバーを起動します。

```bash
npm install
npm run dev
```

ビルドは `npm run build`、Lint は `npm run lint`、整形は
`npm run format`（確認だけなら `npm run format:check`）です。`npm install`
で入るコミット前のフック（`.githooks/pre-commit`）が、ステージしたファイルの書式を確かめ、崩れていればコミットを止めます。

端末のタイムゾーンと今日を決めて全部のテストを回すのは `npm run test:tz`（Los Angeles の夏時間の切り替わる日、東京の年末の 15:30Z とうるう日。時刻は `FAKE_NOW` と `src/test/fakeNow.ts`）。CI は Los Angeles の 2026-11-01 で 1 回回します。

DB のテスト（RLS とトリガー、pgTAP の `supabase/tests/*.sql`）は Docker と Supabase CLI で、手元の DB に対して流します（本番には向けない）:

```bash
supabase start    # 手元の DB を起こし、supabase/migrations を 001 から流す
supabase test db  # supabase/tests を流す
supabase db reset # migration を足した・変えたときに流し直す
```

CI は migration を 2 回流し（何度流しても同じ形になること）、Edge Function を
`deno check` し、DB のテストを流します。

## スマホで使う（PWA）

- **iPhone / iPad**: Safari で開き、共有ボタン →「ホーム画面に追加」
- **Android / Chrome / Edge**:
  アプリ内の「アプリとして使う」（アカウントメニュー、または設定）からインストール
- Service
  Worker（[`public/sw.js`](public/sw.js)）は**本番ビルドだけ**登録します。動作確認は
  `npm run build && npm run preview`
- 通知タップやホーム画面のショートカットは `/?view=planner` のような URL
  で該当画面を開きます

## 同期・通知・連携の設定

Supabase（ログインと同期）・バックアップ・通知（Web Push）・Google でログイン・Google カレンダー・Notion の設定は [`doc/SETUP.md`](doc/SETUP.md)。
