# Chronograma Mobile (Flutter)

UI は **Web 準拠**（Tailwind の accent / zinc スケール + Inter、ガラス風ボトムバー、pill 検索、accent 選択チップ）で、同一サービスと一目で分かるトーンに統一。デザイントークンは [`lib/design/app_colors.dart`](lib/design/app_colors.dart) / [`lib/design/app_theme.dart`](lib/design/app_theme.dart)、共有部品は [`lib/shared/widgets/chronograma_kit.dart`](lib/shared/widgets/chronograma_kit.dart)。**To‑Do**: ツリー表示・DnD 並べ替え・サブタスク追加・セクション グルーピング・予定時刻/繰り返し編集・リスト CRUD（リネーム/色/並べ替え）・複数選択の一括操作・NLP クイック追加・繰り返し完了時の次回生成。**Calendar**: Month / Week / Day / Plan vs Actual、ブロックのドラッグ移動・リサイズ、ToDo ドック、Google 予定（Edge Function）。**Log**: タイムログ＋**グローバルタイマー**＋タグ候補。**Habits**: 頻度/時間帯/色 設定・28日ヒートマップ。**More**: Supabase 同期（アプリ起動時から）、Google Calendar 接続、JSON/CSV、期限通知、統計画面、リスト色パレット/タグ候補、ja/en 切替。Calendar/Log/Habits は選択日を共有。TestFlight は [`TESTFLIGHT.md`](TESTFLIGHT.md)。

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
