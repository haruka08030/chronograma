# Supabase migrations（Chronograma）

スキーマは `001` から番号順に積み重ねる。新しいプロジェクトでも既存の DB でも、**SQL Editor で `001` から順に全部実行**すれば最新の形になる（Postgres 15 以上。Supabase は 15 以上）。各ファイルは何度流しても同じ形になるので、どこまで適用したか分からない DB にも全部流してよい。

| ファイル | 内容 |
|----------|------|
| [`001_chronograma_schema.sql`](001_chronograma_schema.sql) | 最初のスキーマ（全テーブル・インデックス・RLS） |
| [`002_notifications.sql`](002_notifications.sql) | タスクごとの通知（`tasks.reminders`）、記録の確認・止め忘れの通知（`push_subscriptions`） |
| [`003_canvas.sql`](003_canvas.sql) | Canvas 連携（`canvas_connection`、学校ごとに 1 行） |
| [`004_list_delete_no_cascade.sql`](004_list_delete_no_cascade.sql) | リストを消しても中のタスク・セクションを道連れにしない（`on delete no action`） |
| [`005_size_limits.sql`](005_size_limits.sql) | 行の大きさの上限（`*_size_check`、`not valid`） |
| [`006_canvas_legacy_ids.sql`](006_canvas_legacy_ids.sql) | Canvas の最初の版の id（学校名なし）を学校名入りに書き換え、重複をまとめる（データの書き換えのみ。各端末は保存データの版 35 で同じことをする） |
| [`007_push_endpoint_hosts.sql`](007_push_endpoint_hosts.sql) | push 購読の `endpoint` をブラウザのプッシュサービスの URL だけにする（`push_subscriptions_endpoint_host_check`。合わない行は消す） |
| [`008_task_is_sleep.sql`](008_task_is_sleep.sql) | 睡眠の印（`tasks.is_sleep`）を古い DB に足し、タイトルかラベルが「睡眠」の記録に印を付け直す |
| [`009_edge_rate_limits.sql`](009_edge_rate_limits.sql) | Edge Function の呼び出し回数の上限（`edge_rate_limits` と `hit_rate_limit`） |
| [`010_skip_stale_writes.sql`](010_skip_stale_writes.sql) | `lists` / `list_sections` / `tasks` / `habits` で、サーバーの行より `updated_at` が古い更新を捨てる（トリガー `skip_stale_write`） |
| [`011_log_categories.sql`](011_log_categories.sql) | 記録の分類 `tasks.category`（既存の記録は `tags` の先頭から埋める）と、ラベル表 `user_settings.log_labels`（利用者ごとに 1 行、RLS は本人だけ） |

テーブル（最新の形）:

| テーブル | 内容 |
|----------|------|
| `lists` | リスト。`kind`（`tasks` / `someday` / `checklist`）で、いつか・チェックリストを予定・統計・通知から外す |
| `list_sections` | リスト内のセクション |
| `tasks` | タスク・予定・記録。記録の色 `color`、記録の分類 `category`、元の習慣 `habit_id`、睡眠 `is_sleep`、タイムゾーン `time_zone` / `time_zone_anchor`、タスクごとの通知 `reminders` を含む |
| `habits` | 習慣。`time_mode`（`none` / `fixed` / `range`） |
| `user_settings` | 利用者ごとの設定（1 行）。`log_labels` は記録のラベル（分類名と色）の並び。どの端末でも同じラベル表になる |
| `push_subscriptions` | Web Push の端末ごとの購読と通知設定（朝のまとめ・予定の前・締切の前・記録の確認・タイマーの止め忘れ）。送信は Edge Function `daily-reminders` |
| `google_oauth` | Google カレンダーのリフレッシュトークン（暗号化して保存、`_shared/secretBox.ts`）。クライアント向けポリシーなし（Edge Function `google-calendar` が service_role で読み書き） |
| `notion_connection` | Notion の統合トークン（暗号化して保存）と対象データベース。クライアント向けポリシーなし（Edge Function `notion` が service_role で読み書き） |
| `edge_rate_limits` | Edge Function の呼び出し回数（利用者ごと・機能ごとの固定の時間枠）。クライアント向けポリシーなし。数えるのは `hit_rate_limit`（service_role だけが呼べる） |
| `canvas_connection` | Canvas LMS のアクセストークン・フィードの URL（どちらも暗号化して保存）と学校の URL（学校ごとに 1 行、主キー `(user_id, id)`、`id` はホスト名）。クライアント向けポリシーなし（Edge Function `canvas` が service_role で読み書き） |

**メモ**

- `lists` / `list_sections` / `tasks` / `habits` の主キーは `(user_id, id)`。未分類 `__inbox__` のように ID が全員で同じでもぶつからない。外部キーも同じ利用者の行だけを指す。
- `sort_order` は `double precision`（間に挿入すると中間値になるため）。
- スキーマを変えるときは、次の番号の新しいファイルを足す。**コミット済みのファイルは書き換えない**（適用済みの DB と食い違うため）。
- 新しいファイルも何度流しても同じ形になるように書く（`add column if not exists`、`drop constraint if exists` してから `add constraint` など）。
- 1 ファイル 1 変更。ファイル名は `NNN_何を変えるか.sql`。

ルートの [`README.md`](../../README.md) の Supabase 節と、`doc/CURSOR_CONTEXT.md` の DB 節は本ファイルと同期させる。
