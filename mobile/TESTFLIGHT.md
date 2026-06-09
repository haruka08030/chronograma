# TestFlight 配布手順

## 前提

- Apple Developer Program（年 $99）
- Supabase プロジェクト（Web と同じ URL / anon key）
- SQL Editor で `002_google_oauth.sql` を実行済み
- Edge Function `google-calendar` デプロイ済み（`supabase/functions/google-calendar/README.md`）

## Supabase Auth

Redirect URLs に追加:

- `io.supabase.flutter://signin-callback`
- 本番 Web の Vercel URL

Google Provider の Client ID / Secret を Edge Function secrets と同一にする。

## ビルド

```bash
export SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_ANON_KEY=eyJ...
chmod +x scripts/build_ipa.sh
./scripts/build_ipa.sh
```

Xcode で Runner の **Signing & Capabilities** に Development Team を設定してから実行。

## App Store Connect

1. Bundle ID: `com.chronograma.chronogramaMobile`
2. アプリを新規作成 → IPA をアップロード
3. TestFlight → 内部テスターに配布

## バージョン

`pubspec.yaml` の `version: x.y.z+build` を上げてからビルドする。
