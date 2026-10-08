# Chronograma

予定と実際を同じタイムラインに並べて、時間がどこに溶けたか分かる時間割。

## プロジェクト概要

**Chronograma** は学生向けの **React** のシングルページアプリ（PWA）です。1 日を計画して、記録して、ふりかえります。ローカルの作業フォルダ名が `jikanwari` のままの場合があります。

### 主役: 計画 → 記録 → ふりかえり

- **今日の計画**（既定の画面）: 今日のやり残し・今日やること・習慣を左に、1 日のタイムラインを右に置き、ドラッグや「15時 レポート 1時間」のような入力で時間に置く。1 日の区切りは 0 時で、前の日に終わらなかった予定は今日のやり残しに繰り越す
- **記録**: 行の ▶ で記録を始めると、タイムラインの予定の横に実際の記録が並び、予定とのずれが見える
- **ふりかえり**: 予定 vs 実績・活動ログ・統計（日・週・月）、夜の締め（その日の数字）

### その他にできること

- **To‑Do**: ラベル（記録・カレンダーと共通の色の名前）で分ける。期限・時刻・繰り返し、検索・クイック追加、ドラッグでの並べ替え、複数選択と一括操作、直近削除の Undo
- **いつか・チェックリスト**: ラベルとは別のリスト（チェックリストは買い物など）。今日の計画・期限・統計・通知に混ざらない。クイック追加で `@買い物 牛乳` のように追加先を指定
- **カレンダー**: 月／週／3 日／スケジュール表示、時間割（授業を学期の間の毎週の予定に）、よく入れる予定、日付パネルでその日の予定・記録を確認
- **習慣**: ヒートマップ・週次スコア・曜日トグル・時間指定モード（なし／固定時刻／時間帯）など
- **連携（任意）**: Google カレンダー・Notion・Canvas
- **外観**: ライト／ダーク、日本語と英語の UI

**既定の保存先**はブラウザの **localStorage**（Zustand の永続化）です。**Supabase** を環境変数で設定すると、**Google アカウント**かメールの **マジックリンク** でログインし、リスト・タスク・習慣を **クラウド同期**できます。未設定のときは認証なしのローカル専用動作です。

**スマホ・タブレット**も同じ Web アプリで対応しています（**PWA**）。ホーム画面に追加するとアプリとして起動でき、ログイン中は通知がアプリを閉じていても届きます。以前あった Flutter 版（`mobile/`）は廃止しました（Git 履歴には残っています）。

実装寄りの全体像（主要ファイル、同期の挙動、マイグレーション一覧など）は [`doc/CURSOR_CONTEXT.md`](doc/CURSOR_CONTEXT.md) を参照してください。人に公開するときの手順は [`doc/PUBLISHING.md`](doc/PUBLISHING.md)。作業は GitHub の Issue、アイデアと方向性は [`doc/IDEAS.md`](doc/IDEAS.md)、実装で守る決まりは [`doc/RULES.md`](doc/RULES.md) です。

## 設計の全体像（Architecture）

**手元が先（local-first）**。画面はいつも端末のストアを読み書きし、サーバーへの同期は後ろで行います。オフラインでも全部の操作ができます。

| 層 | しくみ | 主なファイル |
| --- | --- | --- |
| 状態 | Zustand のストア 1 つを役割ごとの slice（tasks・lists・sections・habits・timeLogs・settings・ui など）に分ける。行は購読する値だけを選ぶ（`memo` とセレクタ） | `src/store/taskStore.ts`、`src/store/slices/` |
| 端末への保存 | `persist` で localStorage へ。保存する値を DATA / VIEW / TRANSIENT に分け、版番号（`STORE_VERSION`）ごとに段階的に移行する。読めない保存データは上書き前に退避する。端末の中の自動バックアップ（毎日 14 日分など） | `persistKeys.ts`、`migrate.ts`、`src/lib/autoBackup.ts` |
| 同期 | 端末ごとの前回同期の控えとの**三方向マージ**。書き込みは「もとにしたサーバーの版」を付けて送り、サーバーのトリガーが版を確かめてサーバーの時刻を付ける（端末の時計に頼らない）。ふだんの取り込みは**差分**（`updated_at` が前回より新しい行と、削除の記録 `sync_tombstones`）。起動時・6 時間ごと・断られた後は全件 | `src/lib/syncMerge.ts`、`syncPull.ts`、`supabaseData.ts`、`src/hooks/useSupabaseSync.ts` |
| サーバー | Supabase（Postgres + RLS で本人の行だけ）。外部サービスのトークンは Edge Function が暗号化して持ち、ブラウザには出さない。通知は pg_cron が 5 分ごとに Edge Function `daily-reminders` を呼ぶ | `supabase/migrations/`、`supabase/functions/` |
| 画面と URL | ルーターは使わず、ストアの画面の状態を URL（`?view=` / `?list=`）に写して履歴に積む。ブラウザ・スマホの「戻る」が効く | `src/lib/viewUrl.ts`、`urlHistory.ts` |
| 読み込み | 「今日の計画」以外の画面と、開いたときだけ要る詳細・メニューは遅延読み込み。読めなければ次に開くときに読み直す | `src/lib/lazyComponent.ts`、`src/components/lazyOverlays.ts` |
| エラー | 画面・同期・端末の保存・連携・通知の購読のエラーを Supabase の `client_errors` に送る（ログインしていない間はためておき、ログインしたら送る。同じエラーはまとめ、トークンやメールは伏せる。30 日で消える。見る SQL は `supabase/metrics/health.sql`） | `src/lib/errorReport.ts` |

**テスト**: 計算・同期・保存の移行は vitest（node）、画面の部品は vitest + Testing Library（jsdom）、起動から使う流れは Playwright、RLS とトリガーは pgTAP（`supabase/tests/`）。CI（`.github/workflows/ci.yml`）は型・Lint（a11y 込み）・書式・テスト・E2E に加え、Edge Function の型チェックと、ローカルの Supabase に migration を全部流して pgTAP を回します。

## ローカルで動かす（Web）

プロジェクトルートで依存関係を入れたうえで開発サーバーを起動します。

```bash
npm install
npm run dev
```

ビルドは `npm run build`、Lint は `npm run lint`、整形は `npm run format`（確認だけなら `npm run format:check`）です。`npm install` で入るコミット前のフック（`.githooks/pre-commit`）が、ステージしたファイルの書式を確かめ、崩れていればコミットを止めます。

DB のテスト（RLS とトリガー、pgTAP の `supabase/tests/*.sql`）は Docker と Supabase CLI で、手元の DB に対して流します（本番には向けない）:

```bash
supabase start    # 手元の DB を起こし、supabase/migrations を 001 から流す
supabase test db  # supabase/tests を流す
supabase db reset # migration を足した・変えたときに流し直す
```

CI は migration を 2 回流し（何度流しても同じ形になること）、Edge Function を `deno check` し、DB のテストを流します。

## スマホで使う（PWA）

- **iPhone / iPad**: Safari で開き、共有ボタン →「ホーム画面に追加」
- **Android / Chrome / Edge**: アプリ内の「アプリとして使う」（アカウントメニュー、または設定）からインストール
- Service Worker（[`public/sw.js`](public/sw.js)）は**本番ビルドだけ**登録します。動作確認は `npm run build && npm run preview`
- 通知タップやホーム画面のショートカットは `/?view=planner` のような URL で該当画面を開きます

## Supabase のセットアップ（マルチデバイス同期）

1. [Supabase](https://supabase.com) でプロジェクトを作成します。
2. **SQL Editor** で `supabase/migrations/` の SQL を番号順に全部実行し、テーブルと RLS を作成します（[`001_chronograma_schema.sql`](supabase/migrations/001_chronograma_schema.sql) から最後の番号まで。一覧は [`supabase/migrations/README.md`](supabase/migrations/README.md)）。
   どのファイルも何度流しても同じ形になります。先に **Database → Extensions** で `pg_cron` を有効にしておくと、`010`（古い同期の印）と `011`（端末のエラーの記録）を 30 日で消す毎日のジョブができます（後から有効にしたら `010`・`011` を流し直す）。
3. **Authentication → URL Configuration** で **Site URL** に本番のオリジン（開発時は `http://localhost:5173` など）を設定し、**Redirect URLs** にも同じオリジンを追加します（マジックリンクのリダイレクト用）。
   アカウント削除用の Edge Function をデプロイします: `supabase functions deploy account`（設定 → アカウント の「アカウントを削除」が使う）。
   ブラウザから呼ぶ Edge Function（account・google-calendar・notion・canvas）は、secret `ALLOWED_ORIGINS` に入れたオリジンからだけ呼べます。本番の URL を入れてください: `supabase secrets set ALLOWED_ORIGINS=https://your-app.vercel.app`（複数はカンマ区切り）。開発用（`http://localhost:5173`・`:4173`）は環境変数 `ALLOW_DEV_ORIGINS=true` のときだけ足します（ローカルの `supabase functions serve` なら `supabase/functions/.env` に書く。本番の secret には入れない）。
   連携のトークン（Google のリフレッシュトークン・Notion / Canvas のトークン・Canvas のフィード URL）は、DB に置く前に Edge Function が暗号化します。鍵を secret に入れてください: `supabase secrets set TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)`。入れる前に保存したトークン（平文）は、`daily-reminders` が 5 分ごとに少しずつ暗号化し直します（それまでの間、平文のトークンは使わずにエラーにします）。鍵が無い間は連携の保存を断り、500 を返します。
   **鍵の入れ替え**（漏れたときや定期的に）は、連携を切らずにできます:
   1. 今の鍵を前の鍵に回し、新しい鍵を入れる（2 つを 1 回で）: `supabase secrets set TOKEN_ENCRYPTION_PREVIOUS_KEYS=<今の鍵> TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)`。前の鍵がすでにあるなら、カンマ区切りで並べる（`TOKEN_ENCRYPTION_PREVIOUS_KEYS=<今の鍵>,<その前の鍵>`）。secret は次の呼び出しから効き、デプロイし直しは要りません
   2. 連携の関数は前の鍵でも開け、読んだついでに新しい鍵で閉じ直します。使われていない連携の行も `daily-reminders` が 5 分ごとに（表ごと 100 行まで）閉じ直します
   3. 全部閉じ直されたか SQL Editor で確かめる（新しい鍵の名前は暗号文の `enc:v2:` の次の 8 文字。新しく保存された行で分かる）: `select count(*) from google_oauth where refresh_token not like 'enc:v2:<新しい鍵の名前>:%'`（`notion_connection.token`・`canvas_connection.token` / `feed_url` も同じ）が 0 になったら
   4. 前の鍵を外す: `supabase secrets unset TOKEN_ENCRYPTION_PREVIOUS_KEYS`（漏れた鍵はこれで使えなくなる）。0 にならない行は、どの鍵でも開けない壊れた値です（`daily-reminders` のログに `token sweep: unreadable values`）。その連携はつなぎ直しになります
   **鍵を消したり、前の鍵に回さずに替えたりすると、保存済みの連携はすべてつなぎ直しになります**。
   ログイン用メールは、Supabase の標準のメール送信だと 1 時間に送れる数がごく少なく、超えると `email rate limit exceeded` になります。人に使ってもらう前に **Authentication → Emails → SMTP Settings** で自前の SMTP（Resend・SendGrid など）を設定し、**Authentication → Rate Limits** でメールの上限を上げてください。
4. **Project Settings → API** から **Project URL** と **anon public** キーをコピーします。
5. プロジェクトルートに `.env` を置き、`.env.example` を参考に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定します。開発サーバーを再起動します。

ヘッダーの「ログイン」からメールアドレスを送信し、届いたリンクでサインインすると、約 1.8 秒のデバウンス後に変更がサーバーへ同期されます。同期は端末ごとの前回同期状態との**三方向マージ**なので、複数端末で編集しても他端末の追加を消しません（アプリに戻ったときと表示中 1 分ごとにも取り込みます）。

### バックアップ

- **Supabase 側**: DB の自動バックアップがあるかはプランによります。Pro 以上は毎日のバックアップがあり（保てる日数はプランごと）、任意の時点に戻せる PITR は有料の追加機能です。Free プランには自動バックアップが無く、しばらく使われないプロジェクトは一時停止されます。細かい条件は Supabase の料金表と **Database → Backups** の画面で確かめてください。自分で控えを取るなら `supabase db dump --linked -f backup.sql`（スキーマ）と `supabase db dump --linked --data-only -f data.sql`（データ）。
- **アプリ側**: 各端末が IndexedDB に自動で控えを残します（`src/lib/autoBackup.ts`）。毎日の控え（その日はじめて開いたときの状態、14 日分）・同期で手元のタスクが減る直前（5 件分）・ログアウトの直前（5 件分）。戻すのは **設定** の自動バックアップか、エラーの画面の「自動バックアップから戻す」から。控えはその端末の中だけにあり、ほかの端末やサーバーには送りません。JSON の書き出し・取り込みは別にあります。

### 通知（Web Push、任意）

アプリを閉じていても、朝のまとめ・予定の前・締切の前（前日 20:00 と 3 時間前）・予定のあとの記録の確認（「予定どおり / 記録する」）・夜の締め（その日の数字つき）・タイマーの止め忘れ・「あと何分」の時間（最大 5 分ほど遅れます。アプリを開いていればちょうどの時刻）を届けます。タスクごとの通知（詳細の「通知」）も同じ仕組みです。設定しない場合は、アプリを開いている間だけのブラウザ通知になります。iPhone ではホーム画面に追加したアプリでのみ届きます（iOS 16.4 以降）。

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

4. **Database → Extensions** で `pg_cron` と `pg_net` を有効にし、SQL Editor で `CRON_SECRET` を Vault に入れてから、5 分ごとの呼び出しを登録します（`YOUR_PROJECT_REF` と `YOUR_CRON_SECRET` を置き換え）。cron の文には秘密を書かず、呼ぶたびに Vault から読みます（`cron.job` の表に平文で残らない）:

```sql
select vault.create_secret('YOUR_CRON_SECRET', 'chronograma_cron_secret');

select cron.schedule(
  'chronograma-daily-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-reminders',
    headers := jsonb_build_object(
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'chronograma_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
```

`timeout_milliseconds` は応答を待つ上限です（pg_net の既定は 5 秒で、利用者が多いと送り終える前に切れる）。

秘密を平文で書いたジョブがすでにある場合は、上の `vault.create_secret` を流したあと、古いジョブを外して上の `cron.schedule` で登録し直します:

```sql
select cron.unschedule('chronograma-daily-reminders');
-- ここで上の cron.schedule(...) を流す
select jobname, schedule, command from cron.job where jobname = 'chronograma-daily-reminders';  -- 秘密が文に無いこと
```

秘密を変えるときは、Edge Function の secret と Vault の両方を変えます: `supabase secrets set CRON_SECRET=NEW_SECRET` と `select vault.update_secret((select id from vault.secrets where name = 'chronograma_cron_secret'), 'NEW_SECRET');`

通知時刻は各端末のタイムゾーンで判定し、1 日 1 回ずつ送ります。失効した購読（アプリ削除・通知拒否）は自動で削除されます。1 回が失敗しても（読み込みの失敗・デプロイ中・タイムアウト）、次の回が前の成功の回から今まで（上限 60 分）の分を送ります（`reminder_runs`、migration `012`。送った通知は二度送りません）。

### Google でログイン（任意）

ログインの画面に「Google でログイン」を出すには、`VITE_GOOGLE_CLIENT_ID` を設定したうえで次を行います（カレンダー連携と同じ Web クライアントを使えます）。

1. **Google Cloud Console → Credentials → OAuth 2.0 Client (Web)** の **Authorized redirect URIs** に `https://<project-ref>.supabase.co/auth/v1/callback` を追加
2. Supabase の **Authentication → Providers → Google** を有効にし、Client ID / Secret を設定
3. **Authentication → URL Configuration** の **Redirect URLs** に本番と開発のオリジンが入っていること（マジックリンクと同じ）

ログインで求める権限はメールアドレスと名前・プロフィール画像だけです。カレンダーは設定から別に連携します。同じメールアドレスでメールと Google の両方からログインすると、Supabase が同じアカウントにまとめます（Google 側で確認済みのアドレスのとき）。

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

Vercel にデプロイすると `vercel.json` のヘッダーが付きます（`/assets/` は長期キャッシュ、`/`・`/index.html`・`/sw.js` は毎回確認、Content-Security-Policy・Strict-Transport-Security などのセキュリティヘッダー）。CSP の接続先（`connect-src`）はこのアプリの Supabase プロジェクト `https://lcgtczpmohouwqgssfmu.supabase.co`（と `wss://`）だけです。別の Supabase プロジェクト・独自ドメインで動かす場合や、ブラウザから直接ほかの外部 API を呼ぶ処理を足す場合は `vercel.json` の `connect-src` を書き換えてください。画像（`img-src`）は自分のオリジンと `data:` / `blob:` だけです。

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
