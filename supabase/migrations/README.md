# Supabase migrations（Chronograma）

スキーマは `001` から番号順に積み重ねる。新しいプロジェクトは **SQL Editor で番号順に全部実行**すれば最新の形になる（Postgres 15 以上。Supabase は 15 以上）。各ファイルは何度流しても同じ形になる。本番（リンク済みのプロジェクト）へは `supabase db push --linked`（本番の適用履歴 `supabase_migrations.schema_migrations` に無い番号のファイルだけを流して記録する）。流す前に `supabase migration list --linked` か `supabase db push --linked --dry-run` で何が流れるかを確かめる。

| ファイル | 内容 |
|----------|------|
| [`001_chronograma_schema.sql`](001_chronograma_schema.sql) | スキーマ一式（全テーブル・インデックス・大きさの上限・古い書き込みを捨てるトリガー・`hit_rate_limit`・RLS）。前の版の残り（サーバー専用の表のブラウザ向けポリシー・重なった索引）を消す処理も含む |
| [`002_extra_time_zones.sql`](002_extra_time_zones.sql) | 時間バーに並べる他のタイムゾーンと付けた名前 `user_extra_time_zones`（利用者ごとに 1 行、RLS は本人だけ） |
| [`003_habit_archived_at.sql`](003_habit_archived_at.sql) | 習慣のアーカイブ `habits.archived_at`（null は使用中） |
| [`004_sync_server_time.sql`](004_sync_server_time.sql) | `lists` / `list_sections` / `tasks` / `habits` の書き込みをトリガー `sync_write_guard` で確かめる（001 の `skip_stale_write` をこの 4 つの表で置き換える）。`base_updated_at`（端末がもとにした版。行には残さない）を送った書き込みは、サーバーの `updated_at` が同じときだけ通し、`updated_at` をサーバーの時刻にする。送らない書き込み（前の版のアプリ）は前と同じ |
| [`005_skip_stale_write_search_path.sql`](005_skip_stale_write_search_path.sql) | 001 のトリガー関数 `skip_stale_write` の `search_path` を空に固定する（動きは同じ） |
| [`006_row_limits.sql`](006_row_limits.sql) | 1 人が持てる行数の上限（`tasks` 200,000・`list_sections` 5,000・`lists` 1,000・`habits` 1,000・`push_subscriptions` 100）。トリガー `enforce_row_limit`（文ごとに 1 回、新しく入った行がある利用者だけ数える）。upsert で既にある行を更新する分は数えない。超えると errcode `P0001`・メッセージ `row_limit_exceeded` で文ごと断る |
| [`007_settings_server_time.sql`](007_settings_server_time.sql) | `user_settings` / `user_extra_time_zones` の書き込みをトリガー `settings_write_guard` で確かめる（この 2 つの表の `skip_stale_write` を置き換える）。考え方は `004` と同じ: `base_updated_at`（端末がもとにした版。行が無いはずのときは `-infinity`。行には残さない）を送った書き込みは、サーバーの `updated_at` が同じときだけ通し、`updated_at` をサーバーの時刻にする。送らない書き込み（前の版のアプリ）は前と同じ |
| [`008_sync_tombstones.sql`](008_sync_tombstones.sql) | 消えた行の印 `sync_tombstones`（`(user_id, table_name, row_id)` と `deleted_at`）。`lists` / `list_sections` / `tasks` / `habits` の行を消すと（どの版のアプリからでも）トリガー `record_sync_tombstones` が印を残し、同じ id の行がまた入ると印を消す。アカウントの削除（cascade）では残さず、それまでの印も消す。端末からは本人の行の select だけ（書くのはトリガー、SECURITY DEFINER）。端末は差分の取得で、変わった行とこの印だけを取る。差分の目印にするサーバーの時刻を返す `sync_server_now()`（`authenticated` だけ実行できる）。`004` が前提 |
| [`009_sync_updated_at_index.sql`](009_sync_updated_at_index.sql) | 差分の取得のための索引 `(user_id, updated_at)`（`lists` / `list_sections` / `tasks` / `habits`） |
| [`010_sync_tombstone_limits.sql`](010_sync_tombstone_limits.sql) | `sync_tombstones` の上限と自動削除。1 人 50,000 件を超えたら古い印から消し（断らない。印を入れるのは利用者の削除の中なので）、消した印の一番新しい `deleted_at` を `sync_tombstone_purges.last_deleted_at` に残す（端末は本人の行の select だけ。差分の目印がこれより前なら全部を取り直す）。トリガー `trim_sync_tombstones`（文ごとに 1 回、SECURITY DEFINER）。30 日より古い印は pg_cron のジョブ `purge-sync-tombstones`（毎日 03:17 UTC）が消す。`pg_cron` が無い DB ではジョブを作らない（有効にしてから流し直すと作る） |
| [`011_client_errors.sql`](011_client_errors.sql) | 端末のエラーの記録 `client_errors`（種類 `render` / `error` / `unhandledrejection` / `sync` / `chunk`・メッセージ・スタック・場所・版・ブラウザ・`extra`）。大きさの上限 `client_errors_size_check`。端末は本人の行の insert だけ（読む・消すのは service_role）。1 人あたり新しい 500 件まで（トリガー `trim_client_errors` が古いものから消す。断らない）。30 日より古い行は pg_cron のジョブ `chronograma-client-errors-purge` が毎日 3:23（UTC）に消す（pg_cron が無ければジョブは作らない。入れたら流し直す） |
| [`012_reminder_runs.sql`](012_reminder_runs.sql) | 通知の送信（Edge Function `daily-reminders`）の実行の記録 `reminder_runs`（1 行、`id = 1`）。`last_ok_at` は最後に全部うまくいった回の時刻（次の回はここから今まで、上限 60 分の通知を送る）、`running_since` は走っている回の目印（同じ時間を 2 つの回が同時に送らない）。RLS あり・ポリシーなし、`anon` / `authenticated` の権限は外す（service_role だけ） |
| [`013_hit_rate_limit_search_path.sql`](013_hit_rate_limit_search_path.sql) | 001 の `hit_rate_limit`（SECURITY DEFINER）の `search_path` を空に固定し、名前をすべてスキーマ付きにする（動きと権限は同じ。service_role だけが呼べる） |
| [`014_task_is_event.sql`](014_task_is_event.sql) | 予定（完了の丸の無い、時刻のある予定）の印 `tasks.is_event`（既定 false = To-Do）。予定は To-Do の一覧・やり残し・完了数に入れない。列を知らない前の版のアプリでは To-Do に見える |
| [`015_task_estimate.sql`](015_task_estimate.sql) | タスクの見積もり `tasks.estimate_minutes`（分、null は見積もりなし、1〜1440）。タイムラインに置く・時間を決めるときの長さ |
| [`016_task_source_task.sql`](016_task_source_task.sql) | ▶ で始めた記録の元の To-Do・予定 `tasks.source_task_id`（null は元なし）。計画どおりかの突き合わせで元の予定と組にする |
| [`017_min_sync_version.sql`](017_min_sync_version.sql) | 同期の取り決めの版の下限 `app_config.min_sync_version`（アプリの `SYNC_PROTOCOL_VERSION` より大きいと送らずに読み込み直しを促す。上げるときは行を update）。アプリ（anon / authenticated）からの版（`base_updated_at`）なしの書き込みを断り、外部キーの動作で変わった行の `updated_at` をサーバーの時刻にする |
| [`018_habit_time_overrides.sql`](018_habit_time_overrides.sql) | 習慣の日ごとの時間 `habits.time_overrides`（日付 → 開始・終了。タイムラインで枠を動かした日だけ。null は無し）。大きさの上限 256KB |
| [`019_shared_active_timer.sql`](019_shared_active_timer.sql) | 動いているタイマー `user_active_timer`（利用者ごとに 1 行。`started_at` / `task_title` / `tags` / `task_id` / `color`、`started_at` が null なら止まっている。RLS は本人だけ、大きさの上限 `user_active_timer_size_check`）。書き込みは `007` / `017` の `settings_write_guard` で確かめる。行が替わるとトリガー `copy_active_timer_to_push` がその人の全部の `push_subscriptions` の `timer_started_at` / `timer_title`（止め忘れの通知）に写し、購読を書くときもトリガー `push_subscription_shared_timer` がこの行の値にする（行が無い利用者は端末が送った値のまま） |

テーブル（最新の形）:

| テーブル | 内容 |
|----------|------|
| `lists` | リスト。`kind`（`tasks` / `someday` / `checklist`）で、いつか・チェックリストを予定・統計・通知から外す |
| `list_sections` | リスト内のセクション |
| `tasks` | タスク・予定・記録。記録の色 `color`、記録の分類 `category`、元の習慣 `habit_id`、睡眠 `is_sleep`、予定（完了の丸なし）`is_event`、タイムゾーン `time_zone` / `time_zone_anchor`、タスクごとの通知 `reminders`、見積もり `estimate_minutes`、記録の元の To-Do `source_task_id` を含む |
| `habits` | 習慣。`time_mode`（`none` / `fixed` / `range`）、アーカイブ `archived_at`（null は使用中）、日ごとの時間 `time_overrides`（null は無し） |
| `user_settings` | 利用者ごとの設定（1 行）。`log_labels` は記録のラベル（分類名と色）の並び。どの端末でも同じラベル表になる |
| `user_extra_time_zones` | 時間バーに並べる他のタイムゾーン（利用者ごとに 1 行）。`zones` は `{ tz, label }` の並び（`label` は利用者が付けた名前、空でもよい）。どの端末でも同じ並び・名前になる |
| `user_active_timer` | 動いているタイマー（利用者ごとに 1 行）。どの端末でも同じタイマーが出て、どの端末からでも止められる。`started_at` が null なら止まっている |
| `push_subscriptions` | Web Push の端末ごとの購読と通知設定（朝のまとめ・予定の前・締切の前・記録の確認・タイマーの止め忘れ）。送信は Edge Function `daily-reminders`。止め忘れの列（`timer_started_at` / `timer_title`）は `user_active_timer` の写し（`019`） |
| `google_oauth` | Google カレンダーのリフレッシュトークン（暗号化して保存、`_shared/secretBox.ts`）。クライアント向けポリシーなし（Edge Function `google-calendar` が service_role で読み書き） |
| `notion_connection` | Notion の統合トークン（暗号化して保存）と対象データベース。クライアント向けポリシーなし（Edge Function `notion` が service_role で読み書き） |
| `edge_rate_limits` | Edge Function の呼び出し回数（利用者ごと・機能ごとの固定の時間枠）。クライアント向けポリシーなし。数えるのは `hit_rate_limit`（service_role だけが呼べる） |
| `canvas_connection` | Canvas LMS のアクセストークン・フィードの URL（どちらも暗号化して保存）と学校の URL（学校ごとに 1 行、主キー `(user_id, id)`、`id` はホスト名）。クライアント向けポリシーなし（Edge Function `canvas` が service_role で読み書き） |
| `sync_tombstones` | 消えた行の印（`lists` / `list_sections` / `tasks` / `habits`）。印があれば、その行はいまサーバーに無い。書くのはトリガーだけ、端末は読むだけ。1 人 50,000 件まで（超えたら古い印から消す）、30 日より古い印は毎日消す（`010`）。アカウントの削除では Edge Function `account` が先に消す |
| `sync_tombstone_purges` | 上限で消した印の一番新しい `deleted_at`（利用者ごとに 1 行、`last_deleted_at`）。書くのはトリガーだけ、端末は本人の行を読むだけ。差分の目印がこれより前なら端末は全部を取り直す |
| `client_errors` | 端末で起きたエラー（画面の描画・拾われなかったエラー・同期の失敗・部品の読み込みの失敗）。送るのはログイン中の端末（`src/lib/errorReport.ts`）。端末からは insert だけ。見るのは SQL Editor から（`doc/CURSOR_CONTEXT.md` の「端末のエラーを見る」） |
| `reminder_runs` | 通知の送信の実行の記録（1 行）。最後に全部うまくいった回の時刻 `last_ok_at` と、走っている回の目印 `running_since`。読み書きは Edge Function `daily-reminders`（service_role）だけ |

**メモ**

- `lists` / `list_sections` / `tasks` / `habits` の主キーは `(user_id, id)`。未分類 `__inbox__` のように ID が全員で同じでもぶつからない。外部キーも同じ利用者の行だけを指す。
- `sort_order` は `double precision`（間に挿入すると中間値になるため）。
- `001` はそれまでの変更をまとめたベースライン（全テーブルの最新の形）。本番の適用履歴は番号（`001`〜）でファイルと一致する（名前の列はまとめる前のもの。CLI は番号だけで照らし合わせる）。
- スキーマを変えるときは、次の番号の新しいファイルを足す。**コミット済みのファイルの SQL は書き換えない**（適用済みの DB と食い違うため）。コメントだけの修正はよい。
- 新しいファイルも何度流しても同じ形になるように書く（`add column if not exists`、`drop constraint if exists` してから `add constraint` など）。
- 1 ファイル 1 変更。ファイル名は `NNN_何を変えるか.sql`。

- 動きは pgTAP の [`../tests/`](../tests/) で確かめる（手元は `supabase start` → `supabase test db`、CI でも流す）。

ルートの [`README.md`](../../README.md) の Supabase 節と、`doc/CURSOR_CONTEXT.md` の DB 節は本ファイルと同期させる。
