# Chronograma Mobile (Flutter)

Kinetic Workspace デザイン準拠の実装: To‑Do（画面上部**固定検索バー**、スマートビュー、**リスト絞り込みチップ**（Supabase `lists` pull 後）、Hive 永続化、Undo、**円形**グラデ FAB）、ガラス風 Bottom Navigation。**Calendar** は Month / Week 切替＋日別 Plan vs Log サマリー、**Log** は日付別タイムログ＋タイマー開始/停止、**Habits** は独立モデル（作成・日別達成トグル）を実装。**More** は Supabase ログイン/同期（`lists` → `list_sections` → `tasks` → `habits` の順、リストは upsert のみ）に加え、JSON エクスポート v2（`lists` / `listSections` 含む）/インポート、通知権限＋テスト通知、統計カードを実装。

## Requirements

- Flutter SDK (stable 3.41+ 想定)

## Commands

```bash
cd mobile
flutter pub get
flutter run \
  --dart-define=SUPABASE_URL=... \
  --dart-define=SUPABASE_ANON_KEY=...
flutter test
flutter analyze
```

### Supabase が「未設定」になるとき

`--dart-define` は **そのビルドにだけ** 埋め込まれます。**Xcode / Android Studio の Run** だけだと空のままになりがちです。

次のどちらかで解決できます。

1. **推奨**: 上記のとおり `flutter run` に `--dart-define` を付ける（または IDE の launch に同じ define を追加する）。
2. **`mobile/assets/supabase.env` を編集**する。`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` にルートの `.env` と同じ値を書いても動きます（コミットしないよう注意）。

### Google ログインを使うとき

Supabase ダッシュボードで Google Provider を有効化し、`Authentication > URL Configuration` の Redirect URLs に次を追加してください。

- `io.supabase.flutter://signin-callback`

## Structure

- `lib/app/` — `ChronogramaApp`, `go_router` shell, theme mode
- `lib/design/` — colors, spacing, radius, `AppTheme` (Inter via `google_fonts`)
- `lib/features/todo/` — models, repository, list/detail/quick-add
- `lib/features/calendar/` — month/week calendar view + day panel
- `lib/features/habits/` — habit model/providers/screen
- `lib/features/log/` — Log タブ、タイムログ編集シート、タグ色
- `lib/features/more/` — account/sync, JSON export/import, notification test, stats cards
- `lib/features/sync/` — Supabase auth + task/habit sync（pull / debounced push）
- `lib/shared/widgets/` — glass bottom bar, gradient FAB

## Notes

- Web 版（`src/`）とは別プロジェクト。同期先スキーマは Web の `lists` / `tasks` テーブルを共有。
- 初回データは空で開始。ログイン後は Supabase 側データを表示。
