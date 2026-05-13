# Chronograma — ネクストタスク（作業候補）

実装の正はコードと [`CURSOR_CONTEXT.md`](./CURSOR_CONTEXT.md)。本ファイルは **優先して手を付けたい改善・未整合** を短く集約したもの。完了したら該当行を更新するか削除する。

## 済（参照用）

| 日付 | 内容 |
| ---- | ---- |
| 2026-05 | **モバイル Supabase タスク**: `list_id` / `parent_id` / `section_id` / `sort_order` / `recurrence` / `created_at` / `updated_at` を `Task` モデルと `SupabaseSyncRepository` の fetch・push で Web と同列に round-trip。未分類 ID は `Task.inboxListId`（`__inbox__`）。push 前の `_ensureInboxList` は維持 |
| 2026-05 | **モバイル習慣**: `frequency`（daily / weekly）・`time_mode`・`created_at` / `updated_at` を `Habit` と同期で round-trip |
| 2026-05 | **優先度**: Web の `none` に対応するため `TaskPriority.none` を追加（モバイル UI は従来どおり主に low/medium/high） |

## 高優先度（データ・同期）

| 領域 | 内容 | メモ |
| ---- | ---- | ---- |
| モバイル ↔ Supabase **リスト** | タスクの `list_id` は保持するが、**`lists` テーブルの pull / モバイルでのリスト切替 UI は未実装**。Web 専用で作ったリストにだけモバイルからタスクを足すと、該当 `list_id` の行が DB に無いと FK で push が失敗しうる | 対策案: pull 時に `lists` を取り込む、または push 前にタスクが参照する `list_id` を upsert |
| 同上 **セクション名** | `section_id` はタスクに付くが **`list_sections` を読んでいない**ため、モバイル上ではセクション名・並びを編集できない | Web との完全パリティが必要なら `list_sections` の fetch + モデル化 |
| モバイル **ツリー UI** | `parent_id` は同期されるが **To‑Do 画面はフラット一覧のまま**（サブタスクの入れ子表示・DnD なし） | 意図的スコープなら `CURSOR_CONTEXT.md` に明記でよい |

## 中優先度（プロダクト差・保守）

| 領域 | 内容 | メモ |
| ---- | ---- | ---- |
| Web / モバイル機能差 | **クイック追加の自然言語**（Web の `parseQuickAdd` 相当）をモバイルでどこまで寄せるか方針決め | |
| ドキュメント | **README と古いドキュメント間のマイグレーション説明の齟齬** を潰す（重複・旧名の整理） | `CURSOR_CONTEXT.md`「実装時の注意」にも記載あり |

## 運用・環境（コード変更なしでも可）

| 項目 | 内容 |
| ---- | ---- |
| Supabase | 各環境で **`001`〜`006` を番号順**に適用済みか確認（特に **`006`**: `end_date`）。モバイルの `fetchTasks` は `end_date` を select するため、未適用 DB では fetch が失敗しうる |
| デバッグログ | ルート `.gitignore` の `*.log` で `.cursor/debug-*.log` は通常除外済み |

## 低優先度・アイデア

- モバイルの `flutter test` / `flutter analyze` を CI で回す（未設定なら）
- Web の `npm run lint` / `build` を PR ごとに固定化

---

*最終更新: モバイル同期の高優先項目を実装し、残タスクを再整理。*
