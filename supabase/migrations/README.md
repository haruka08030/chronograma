# Supabase migrations（Chronograma）

**個人開発・SQL Editor 前提**: スキーマは **`001_chronograma_schema.sql` 1 本**にまとめている。Supabase の **SQL Editor でファイル全体を一度実行**すれば、`lists` / `list_sections` / `tasks` / `habits` と RLS まで揃う。

| ファイル | 内容 |
|----------|------|
| `001_chronograma_schema.sql` | 上記すべて（`tasks.end_date` / `completed_at` / `location` / `due_time`（締め切り時刻）/ `scheduled_date`（予定日）、旧 `pinned` 削除、`habits.time_mode` と CHECK、方針どおり `DROP POLICY IF EXISTS` 付きで再実行しやすい） |
| `002_google_oauth.sql` | Google Calendar 連携用 `google_oauth` 表（Edge Function が service_role で upsert） |
| `003_push_subscriptions.sql` | 朝・夕方の Web Push 用の端末ごとの購読（`push_subscriptions`、RLS は本人のみ。送信は Edge Function `daily-reminders` が service_role で読む） |
| `004_list_kind.sql` | `lists.kind`（`tasks` / `someday` / `checklist`）。いつか・チェックリストのリストを予定・統計・通知から外すため。未適用でも Web は種類なしで同期を続ける |
| `005_event_reminders.sql` | `push_subscriptions.event_reminder_minutes`（予定の開始何分前に通知）と `event_notified`（その日に通知済みの予定 ID）。未適用でもアプリは動き、予定前通知はタブを開いている間だけになる |
| `006_task_color.sql` | `tasks.color`（記録の色）。Google カレンダーの予定から記録にしたとき元の予定の色を写す。null は分類の色。未適用でも同期は color なしで続く |
| `007_task_habit_id.sql` | `tasks.habit_id`（習慣から作った記録の習慣 ID）。時間を決めた習慣は、この記録の時刻で「時間どおり（±15 分）」かを判定する。未適用でも同期は habit_id なしで続く（その場合、他の端末では時間外の判定が出ない） |
| `008_sort_order_fractional.sql` | `lists` / `list_sections` / `tasks` の `sort_order` を `double precision` に。タスクの間に挿入すると中間値（例 62.5）になり、integer のままだと同期全体が失敗する。**未適用だと同期が止まる**ので必ず適用する |
| `009_notion.sql` | Notion 連携用 `notion_connection` 表（統合トークン・データベース ID・要アクションのステータスと完了時の進め先）。トークンはブラウザに出さないので RLS のポリシーは無く、Edge Function `notion` が service_role で読み書きする |
| `010_task_is_sleep.sql` | `tasks.is_sleep`（睡眠の記録）。朝に「何時に寝て何時に起きたか」で入れる記録で、記録の時間・分類の集計から外し、タイムラインでは落ち着いた色で描く。未適用でも同期は is_sleep なしで続く（その場合、他の端末では普通の記録に見える） |
| `011_due_reminders.sql` | `push_subscriptions.due_reminders`（締切の通知を Web Push でも送るか）と `due_notified`（その日に通知済みの締切タスク ID）。未適用でも動くが、締切の通知はタブを開いている間だけになる |
| `012_per_user_keys.sql` | `lists` / `list_sections` / `tasks` / `habits` の主キーを `(user_id, id)` に、外部キーも同じ利用者の行だけを指すように張り直す。未分類の ID は全員 `__inbox__` なので、id だけの主キーだと 2 人目以降の同期が最初の利用者の行とぶつかって止まっていた。**一般公開の前に必ず適用する**（Postgres 15 以上） |
| `013_google_oauth_server_only.sql` | `google_oauth` の SELECT ポリシーを外し、リフレッシュトークンをブラウザから読めなくする（Edge Function は service_role で読む） |
| `014_task_time_zone.sql` | `tasks.time_zone`（そのタスク・記録を入れたタイムゾーン）と `time_zone_anchor`（日付・時刻の列がどのタイムゾーンで書かれているか）。各端末が読み込み時に自分のアプリのタイムゾーンへ同じ瞬間のまま書き直す。未適用でも同期は続く（その場合、他の端末ではタイムゾーンの指定が消える） |

**メモ**

- 習慣のクラウド同期に必要な **`habits.time_mode`** もこの 1 ファイルに含む。
- 将来チーム化や Supabase CLI の厳密運用に切り替えるときは、この 1 本を分割して **追記のみの番号付きマイグレーション**に戻すのが無難。

ルートの [`README.md`](../../README.md) の Supabase 節と、`doc/CURSOR_CONTEXT.md` の DB 節は本ファイルと同期させる。
