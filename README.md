# Chronograma

## プロジェクト概要

**Chronograma** は、**タスク（To‑Do）**・**カレンダー**・**タイムログ**・**習慣トラッキング**をまとめて扱う **React** のシングルページアプリです。ローカルの作業フォルダ名が `jikanwari` のままの場合があります。

主な機能のイメージは次のとおりです。

- **To‑Do**: リストとセクション、期限・時刻・繰り返し、検索・クイック追加、ドラッグでの並べ替えとリスト間の移動、複数選択と一括操作、直近削除の Undo
- **カレンダー**: 月表示／週タイムライン、（任意で）Google カレンダー連携、日付パネルでその日の予定・ログを確認
- **予定 vs 実績**・**活動ログ**・**統計**（通常タスク中心の集計）
- **習慣**: ヒートマップ・週次スコア・曜日トグル・時間指定モード（なし／固定時刻／時間帯）など
- **外観**: ライト／ダーク、日本語と英語の UI

**既定の保存先**はブラウザの **localStorage**（Zustand の永続化）です。**Supabase** を環境変数で設定すると、メールの **マジックリンク** でログインし、リスト・タスク・習慣を **クラウド同期**できます。未設定のときは認証なしのローカル専用動作です。

同梱の **Flutter** アプリ（`mobile/`）では、スマホ向けに To‑Do 中心の画面を段階的に用意しています。

実装寄りの全体像（主要ファイル、同期の挙動、マイグレーション一覧など）は [`doc/CURSOR_CONTEXT.md`](doc/CURSOR_CONTEXT.md) を参照してください。優先して直したい作業候補の一覧は [`doc/NEXT_TASKS.md`](doc/NEXT_TASKS.md) です。

## ローカルで動かす（Web）

プロジェクトルートで依存関係を入れたうえで開発サーバーを起動します。

```bash
npm install
npm run dev
```

ビルドは `npm run build`、Lint は `npm run lint` です。

## モバイル（Flutter）

`mobile/` に Flutter 版があります（To‑Do 中心の Phase 1）。`cd mobile && flutter run`。概要は [`mobile/README.md`](mobile/README.md)。

## Supabase のセットアップ（マルチデバイス同期）

1. [Supabase](https://supabase.com) でプロジェクトを作成します。
2. **SQL Editor** で [`supabase/migrations/001_chronograma_schema.sql`](supabase/migrations/001_chronograma_schema.sql) を**まとめて実行**し、テーブルと RLS を作成します（概要は [`supabase/migrations/README.md`](supabase/migrations/README.md)）。
3. **Authentication → URL Configuration** で **Site URL** に本番のオリジン（開発時は `http://localhost:5173` など）を設定し、**Redirect URLs** にも同じオリジンを追加します（マジックリンクのリダイレクト用）。
4. **Project Settings → API** から **Project URL** と **anon public** キーをコピーします。
5. プロジェクトルートに `.env` を置き、`.env.example` を参考に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定します。開発サーバーを再起動します。

ヘッダーの「ログイン」からメールアドレスを送信し、届いたリンクでサインインすると、約 1.8 秒のデバウンス後に変更がサーバーへ同期されます。

### Google Calendar 連携（任意）

予定の取り込みは Supabase **Edge Function** `google-calendar` 経由です（`002_google_oauth.sql` で `google_oauth` 表を作成）。

1. **SQL Editor** で [`supabase/migrations/002_google_oauth.sql`](supabase/migrations/002_google_oauth.sql) を実行（未適用の場合）。
2. **Authentication → Providers → Google** で Client ID / Secret を設定（Google Cloud Console の Web クライアントと同じもの）。
3. **Authentication → URL Configuration** の **Redirect URLs** に、Vercel 本番 URL（例 `https://your-app.vercel.app`）と `http://localhost:5173` を追加。
4. **Authentication → Settings** で **Manual linking** を有効化（マジックリンクログイン後に Google を紐づけるため）。
5. Edge Function をデプロイし、シークレットを設定します（詳細は [`supabase/functions/google-calendar/README.md`](supabase/functions/google-calendar/README.md)）:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set \
  GOOGLE_CLIENT_ID=your_web_oauth_client_id \
  GOOGLE_CLIENT_SECRET=your_web_oauth_client_secret
supabase functions deploy google-calendar
```

Vercel では `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` のみ必要です（`VITE_GOOGLE_CLIENT_ID` は Web では未使用）。
