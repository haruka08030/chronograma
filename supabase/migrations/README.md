# Supabase migrations（Chronograma）

**個人開発・SQL Editor 前提**: スキーマは **`001_chronograma_schema.sql` 1 本**にまとめている。Supabase の **SQL Editor でファイル全体を一度実行**すれば、`lists` / `list_sections` / `tasks` / `habits` と RLS まで揃う。

| ファイル | 内容 |
|----------|------|
| `001_chronograma_schema.sql` | 上記すべて（`tasks.end_date` / `completed_at` / `location` / `due_time`（締め切り時刻）/ `scheduled_date`（予定日）、旧 `pinned` 削除、`habits.time_mode` と CHECK、方針どおり `DROP POLICY IF EXISTS` 付きで再実行しやすい） |
| `002_google_oauth.sql` | Google Calendar 連携用 `google_oauth` 表（Edge Function が service_role で upsert） |
| `002_google_oauth.sql` | Google Calendar 用 `refresh_token` 保管（Edge Function が service_role で upsert） |

**メモ**

- 習慣のクラウド同期に必要な **`habits.time_mode`** もこの 1 ファイルに含む。
- 将来チーム化や Supabase CLI の厳密運用に切り替えるときは、この 1 本を分割して **追記のみの番号付きマイグレーション**に戻すのが無難。

ルートの [`README.md`](../../README.md) の Supabase 節と、`doc/CURSOR_CONTEXT.md` の DB 節は本ファイルと同期させる。
