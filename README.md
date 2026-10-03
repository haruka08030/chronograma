# Chronograma

## プロジェクト概要

**Chronograma** は、**タスク（To‑Do）**・**カレンダー**・**タイムログ**・**習慣トラッキング**をまとめて扱う **React** のシングルページアプリです。ローカルの作業フォルダ名が `jikanwari` のままの場合があります。

主な機能のイメージは次のとおりです。

- **今日の計画**（既定の画面）: やり残しの持ち越し・今日やること・習慣を左に、1 日のタイムラインを右に置き、ドラッグや「15時 企画書 1時間」のような入力で時間を確保。夕方に「残りを明日へ」で 1 日を締める
- **リストの種類**: 「やること」「いつか（Wish）」「チェックリスト（買い物など）」。Wish や買い物は今日の計画・期限・統計・通知に混ざらない。クイック追加で `@買い物 牛乳` のように追加先を指定
- **To‑Do**: リストとセクション、期限・時刻・繰り返し、検索・クイック追加、ドラッグでの並べ替えとリスト間の移動、複数選択と一括操作、直近削除の Undo
- **カレンダー**: 月表示／週タイムライン、（任意で）Google カレンダー連携、日付パネルでその日の予定・ログを確認
- **予定 vs 実績**・**活動ログ**・**統計**（通常タスク中心の集計）
- **習慣**: ヒートマップ・週次スコア・曜日トグル・時間指定モード（なし／固定時刻／時間帯）など
- **外観**: ライト／ダーク、日本語と英語の UI

**既定の保存先**はブラウザの **localStorage**（Zustand の永続化）です。**Supabase** を環境変数で設定すると、メールの **マジックリンク** でログインし、リスト・タスク・習慣を **クラウド同期**できます。未設定のときは認証なしのローカル専用動作です。

**スマホ・タブレット**も同じ Web アプリで対応しています（**PWA**）。ホーム画面に追加するとアプリとして起動でき、ログイン中は通知がアプリを閉じていても届きます。以前あった Flutter 版（`mobile/`）は廃止しました（Git 履歴には残っています）。

実装寄りの全体像（主要ファイル、同期の挙動、マイグレーション一覧など）は [`doc/CURSOR_CONTEXT.md`](doc/CURSOR_CONTEXT.md) を参照してください。作業は GitHub の Issue、アイデアと方向性は [`doc/IDEAS.md`](doc/IDEAS.md)、実装で守る決まりは [`doc/RULES.md`](doc/RULES.md) です。

## ローカルで動かす（Web）

プロジェクトルートで依存関係を入れたうえで開発サーバーを起動します。

```bash
npm install
npm run dev
```

ビルドは `npm run build`、Lint は `npm run lint` です。

## スマホで使う（PWA）

- **iPhone / iPad**: Safari で開き、共有ボタン →「ホーム画面に追加」
- **Android / Chrome / Edge**: アプリ内の「アプリとして使う」（アカウントメニュー、または設定）からインストール
- Service Worker（[`public/sw.js`](public/sw.js)）は**本番ビルドだけ**登録します。動作確認は `npm run build && npm run preview`
- 通知タップやホーム画面のショートカットは `/?view=planner` のような URL で該当画面を開きます

## Supabase のセットアップ（マルチデバイス同期）

1. [Supabase](https://supabase.com) でプロジェクトを作成します。
2. **SQL Editor** で [`supabase/migrations/001_chronograma_schema.sql`](supabase/migrations/001_chronograma_schema.sql) から番号順に `supabase/migrations/` の SQL を全部実行し、テーブルと RLS を作成します（一覧は [`supabase/migrations/README.md`](supabase/migrations/README.md)）。
   既存の DB も同じく全部実行すれば最新の形になります（どのファイルも何度流しても同じ形になります）。
3. **Authentication → URL Configuration** で **Site URL** に本番のオリジン（開発時は `http://localhost:5173` など）を設定し、**Redirect URLs** にも同じオリジンを追加します（マジックリンクのリダイレクト用）。
   アカウント削除用の Edge Function をデプロイします: `supabase functions deploy account`（設定 → アカウント の「アカウントを削除」が使う）。
   ブラウザから呼ぶ Edge Function（account・google-calendar・notion・canvas）は、開発用（`http://localhost:5173`・`:4173`）と secret `ALLOWED_ORIGINS` に入れたオリジンからだけ呼べます。本番の URL を入れてください: `supabase secrets set ALLOWED_ORIGINS=https://your-app.vercel.app`（複数はカンマ区切り）。
   連携のトークン（Google のリフレッシュトークン・Notion / Canvas のトークン・Canvas のフィード URL）は、DB に置く前に Edge Function が暗号化します。鍵を secret に入れてください: `supabase secrets set TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)`。入れる前に保存したトークンは、次に使われたときに暗号化し直されます。**鍵を変えたり消したりすると、保存済みの連携はすべてつなぎ直しになります**（鍵が無い間は暗号化せずに保存します）。
   ログイン用メールは、Supabase の標準のメール送信だと 1 時間に送れる数がごく少なく、超えると `email rate limit exceeded` になります。人に使ってもらう前に **Authentication → Emails → SMTP Settings** で自前の SMTP（Resend・SendGrid など）を設定し、**Authentication → Rate Limits** でメールの上限を上げてください。
4. **Project Settings → API** から **Project URL** と **anon public** キーをコピーします。
5. プロジェクトルートに `.env` を置き、`.env.example` を参考に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定します。開発サーバーを再起動します。

ヘッダーの「ログイン」からメールアドレスを送信し、届いたリンクでサインインすると、約 1.8 秒のデバウンス後に変更がサーバーへ同期されます。同期は端末ごとの前回同期状態との**三方向マージ**なので、複数端末で編集しても他端末の追加を消しません（アプリに戻ったときと表示中 1 分ごとにも取り込みます）。

### 通知（Web Push、任意）

アプリを閉じていても、朝のまとめ・予定の前・締切の前（前日 20:00 と 3 時間前）・予定のあとの記録の確認（「予定どおり / 記録する」）・タイマーの止め忘れを届けます。タスクごとの通知（詳細の「通知」）も同じ仕組みです。既存の DB には [`002_notifications.sql`](supabase/migrations/002_notifications.sql) を実行してください。設定しない場合は、アプリを開いている間だけのブラウザ通知になります。iPhone ではホーム画面に追加したアプリでのみ届きます（iOS 16.4 以降）。

1. VAPID 鍵を作る: `npx web-push generate-vapid-keys`
2. 公開鍵を `.env`（とホスティングの環境変数）の `VITE_VAPID_PUBLIC_KEY` に設定
3. Edge Function のシークレットを設定してデプロイ:

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
  VAPID_SUBJECT=mailto:you@example.com \
  CRON_SECRET=$(openssl rand -hex 24)
supabase functions deploy daily-reminders
```

4. **Database → Extensions** で `pg_cron` と `pg_net` を有効にし、SQL Editor で 5 分ごとの呼び出しを登録（`YOUR_PROJECT_REF` と `YOUR_CRON_SECRET` を置き換え）:

```sql
select cron.schedule(
  'chronograma-daily-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-reminders',
    headers := jsonb_build_object('x-cron-secret', 'YOUR_CRON_SECRET')
  );
  $$
);
```

通知時刻は各端末のタイムゾーンで判定し、1 日 1 回ずつ送ります。失効した購読（アプリ削除・通知拒否）は自動で削除されます。

### Google Calendar 連携（任意）

予定の取り込みは Supabase **Edge Function** `google-calendar` 経由です（リフレッシュトークンは `google_oauth` 表に保存）。

1. **Google Cloud Console** で次の2点（開発中はスコープの手動追加は不要。アプリが OAuth URL に自動付与する。一般公開には OAuth 同意画面に `calendar.events.owned`・`calendar.calendarlist.readonly` を登録し（理由は [`doc/GOOGLE_VERIFICATION.md`](doc/GOOGLE_VERIFICATION.md)）、プライバシーポリシー（`/privacy.html`）の URL を添えて Google の審査を受ける）:
   - **APIs & Services → Library** で **Google Calendar API** を有効化
   - **APIs & Services → Credentials → OAuth 2.0 Client (Web)** の **Authorized redirect URIs** に `http://localhost:5173` と本番 URL（例 `https://your-app.vercel.app`）を追加
2. **Authentication → Providers → Google** で Client ID / Secret を設定（上記と同じ Web クライアント）。
3. Edge Function をデプロイし、シークレットを設定します（詳細は [`supabase/functions/google-calendar/README.md`](supabase/functions/google-calendar/README.md)）:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set \
  GOOGLE_CLIENT_ID=your_web_oauth_client_id \
  GOOGLE_CLIENT_SECRET=your_web_oauth_client_secret
supabase functions deploy google-calendar
```

Vercel では `VITE_SUPABASE_URL`・`VITE_SUPABASE_ANON_KEY`・`VITE_GOOGLE_CLIENT_ID`（Google Cloud の Web クライアント ID）が必要です。カレンダー連携は Supabase Auth ではなくアプリから直接 Google OAuth し、Edge Function が authorization code を refresh token に交換して保存します。

Vercel にデプロイすると `vercel.json` のヘッダーが付きます（`/assets/` は長期キャッシュ、`/`・`/index.html`・`/sw.js` は毎回確認、Content-Security-Policy などのセキュリティヘッダー）。CSP の接続先は `https://*.supabase.co` だけなので、Supabase に独自ドメインを使う場合や、ブラウザから直接ほかの外部 API を呼ぶ処理を足す場合は `connect-src` に追加してください。

### Notion 連携（任意）

Notion のデータベースから「要アクション」のステータスの行をタスクとして取り込み、そのタスクを完了にすると Notion 側のステータスを次へ進めます。Edge Function `notion` 経由で、統合トークンは `notion_connection` 表に保存します（ブラウザには返しません）。詳細は [`supabase/functions/notion/README.md`](supabase/functions/notion/README.md)。

1. `supabase/migrations/` の SQL を全部実行しておきます（`notion_connection` は `001` で作られます）。
2. Edge Function をデプロイします。シークレットの設定は要りません（呼び出し元の制限は上の `ALLOWED_ORIGINS` を使います）:

```bash
supabase functions deploy notion
```

3. 使う人がアプリで **設定 → 外部連携 → Notion** を開き、画面の手順どおりにつなぎます:
   - [Notion のインテグレーション](https://www.notion.so/profile/integrations) で「内部インテグレーション」を作り、シークレットをコピーする
   - 取り込みたいデータベースを開き、右上の「…」→「接続」でそのインテグレーションを追加する
   - シークレットとデータベースの URL を貼って「接続する」
4. 「ステータスの列」「日付の列」「要アクションのステータス」と、それぞれ「完了したら」進めるステータスを選ぶと同期が始まります（アプリを開いている間は 5 分ごと）。

アプリから Notion のトークンは取り消せません。連携をやめたあと Notion からのアクセスも止めるには、Notion の設定でインテグレーションを外します。
