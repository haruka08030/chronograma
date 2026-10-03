# Supabase migrations（Chronograma）

スキーマは `001` から番号順に積み重ねる（いまは `001` の 1 本）。新しいプロジェクトは **SQL Editor で番号順に全部実行**すれば最新の形になる（Postgres 15 以上。Supabase は 15 以上）。各ファイルは何度流しても同じ形になる。本番（リンク済みのプロジェクト）へは Supabase CLI で流す: `supabase db query --linked -f supabase/migrations/<ファイル>`。

| ファイル | 内容 |
|----------|------|
| [`001_chronograma_schema.sql`](001_chronograma_schema.sql) | スキーマ一式（全テーブル・インデックス・大きさの上限・古い書き込みを捨てるトリガー・`hit_rate_limit`・RLS）。前の版の残り（サーバー専用の表のブラウザ向けポリシー・重なった索引）を消す処理も含む |
| [`002_extra_time_zones.sql`](002_extra_time_zones.sql) | 時間バーに並べる他のタイムゾーンと付けた名前 `user_extra_time_zones`（利用者ごとに 1 行、RLS は本人だけ） |
| [`003_habit_archived_at.sql`](003_habit_archived_at.sql) | 習慣のアーカイブ `habits.archived_at`（null は使用中） |

テーブル（最新の形）:

| テーブル | 内容 |
|----------|------|
| `lists` | リスト。`kind`（`tasks` / `someday` / `checklist`）で、いつか・チェックリストを予定・統計・通知から外す |
| `list_sections` | リスト内のセクション |
| `tasks` | タスク・予定・記録。記録の色 `color`、記録の分類 `category`、元の習慣 `habit_id`、睡眠 `is_sleep`、タイムゾーン `time_zone` / `time_zone_anchor`、タスクごとの通知 `reminders` を含む |
| `habits` | 習慣。`time_mode`（`none` / `fixed` / `range`）、アーカイブ `archived_at`（null は使用中） |
| `user_settings` | 利用者ごとの設定（1 行）。`log_labels` は記録のラベル（分類名と色）の並び。どの端末でも同じラベル表になる |
| `user_extra_time_zones` | 時間バーに並べる他のタイムゾーン（利用者ごとに 1 行）。`zones` は `{ tz, label }` の並び（`label` は利用者が付けた名前、空でもよい）。どの端末でも同じ並び・名前になる |
| `push_subscriptions` | Web Push の端末ごとの購読と通知設定（朝のまとめ・予定の前・締切の前・記録の確認・タイマーの止め忘れ）。送信は Edge Function `daily-reminders` |
| `google_oauth` | Google カレンダーのリフレッシュトークン（暗号化して保存、`_shared/secretBox.ts`）。クライアント向けポリシーなし（Edge Function `google-calendar` が service_role で読み書き） |
| `notion_connection` | Notion の統合トークン（暗号化して保存）と対象データベース。クライアント向けポリシーなし（Edge Function `notion` が service_role で読み書き） |
| `edge_rate_limits` | Edge Function の呼び出し回数（利用者ごと・機能ごとの固定の時間枠）。クライアント向けポリシーなし。数えるのは `hit_rate_limit`（service_role だけが呼べる） |
| `canvas_connection` | Canvas LMS のアクセストークン・フィードの URL（どちらも暗号化して保存）と学校の URL（学校ごとに 1 行、主キー `(user_id, id)`、`id` はホスト名）。クライアント向けポリシーなし（Edge Function `canvas` が service_role で読み書き） |

**メモ**

- `lists` / `list_sections` / `tasks` / `habits` の主キーは `(user_id, id)`。未分類 `__inbox__` のように ID が全員で同じでもぶつからない。外部キーも同じ利用者の行だけを指す。
- `sort_order` は `double precision`（間に挿入すると中間値になるため）。
- スキーマを変えるときは、次の番号（002 から）の新しいファイルを足す。**コミット済みのファイルは書き換えない**（適用済みの DB と食い違うため）。
- 新しいファイルも何度流しても同じ形になるように書く（`add column if not exists`、`drop constraint if exists` してから `add constraint` など）。
- 1 ファイル 1 変更。ファイル名は `NNN_何を変えるか.sql`。

ルートの [`README.md`](../../README.md) の Supabase 節と、`doc/CURSOR_CONTEXT.md` の DB 節は本ファイルと同期させる。
