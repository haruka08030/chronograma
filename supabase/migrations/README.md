# Supabase migrations（Chronograma）

スキーマは **[`001_chronograma_schema.sql`](001_chronograma_schema.sql) 1 本**。新しいプロジェクトの **SQL Editor でファイル全体を 1 回実行**すれば、全テーブルと RLS が揃う（Postgres 15 以上。Supabase は 15 以上）。

| テーブル | 内容 |
|----------|------|
| `lists` | リスト。`kind`（`tasks` / `someday` / `checklist`）で、いつか・チェックリストを予定・統計・通知から外す |
| `list_sections` | リスト内のセクション |
| `tasks` | タスク・予定・記録。記録の色 `color`、元の習慣 `habit_id`、睡眠 `is_sleep`、タイムゾーン `time_zone` / `time_zone_anchor` を含む |
| `habits` | 習慣。`time_mode`（`none` / `fixed` / `range`） |
| `push_subscriptions` | Web Push の端末ごとの購読と通知設定（朝・夕方・予定の開始前・締切）。送信は Edge Function `daily-reminders` |
| `google_oauth` | Google カレンダーのリフレッシュトークン。クライアント向けポリシーなし（Edge Function `google-calendar` が service_role で読み書き） |
| `notion_connection` | Notion の統合トークンと対象データベース。クライアント向けポリシーなし（Edge Function `notion` が service_role で読み書き） |

**メモ**

- `lists` / `list_sections` / `tasks` / `habits` の主キーは `(user_id, id)`。未分類 `__inbox__` のように ID が全員で同じでもぶつからない。外部キーも同じ利用者の行だけを指す。
- `sort_order` は `double precision`（間に挿入すると中間値になるため）。
- 以前は 001〜014 の追記型マイグレーションだった（2026-10 に 1 本へまとめた）。それらを適用済みの既存 DB はそのままでよい。まとめた後にスキーマを変えるときは、`001` を最終形に直したうえで、既存 DB 向けの `alter table` を `002_...sql` として追加する。

ルートの [`README.md`](../../README.md) の Supabase 節と、`doc/CURSOR_CONTEXT.md` の DB 節は本ファイルと同期させる。
