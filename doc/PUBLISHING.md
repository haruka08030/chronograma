# 公開の手順

友達より広く使ってもらうときに、上から順に行う。各項目の詳しい設定は [`README.md`](../README.md) の該当の節。

## 1. Supabase のコードと DB を本番にそろえる

1. CLI のログインを確かめる: `supabase login`（`Unauthorized` が出るときはログインし直す）
2. migration を流す: `supabase db push --linked --dry-run` で流れるファイルを確かめてから `supabase db push --linked`
3. Edge Function を出す（migration の後。`daily-reminders` は `reminder_runs` の表が無いと 500 を返して何も送らない）:

```bash
for f in account canvas daily-reminders google-calendar notion; do supabase functions deploy $f; done
```

4. 通知の cron の秘密を Vault から読む形にする（README「通知」の SQL。`cron.job` の文に秘密が残っていないことを確かめる）

## 2. 秘密と環境変数

| 置き場所 | 名前 | 用途 |
| --- | --- | --- |
| Vercel（ビルド時） | `VITE_SUPABASE_URL`・`VITE_SUPABASE_ANON_KEY` | ログインと同期 |
| Vercel | `VITE_GOOGLE_CLIENT_ID` | Google でログイン・カレンダー連携のボタン |
| Vercel | `VITE_VAPID_PUBLIC_KEY` | 通知の購読 |
| Supabase secrets | `ALLOWED_ORIGINS` | Edge Function を呼べるオリジン（本番の URL） |
| Supabase secrets | `TOKEN_ENCRYPTION_KEY` | 連携のトークンの暗号化（今の鍵）。替えるときは今の鍵を `TOKEN_ENCRYPTION_PREVIOUS_KEYS` に回す（手順はルート `README.md`）。回さずに替えると保存済みの連携はすべてつなぎ直し |
| Supabase secrets | `TOKEN_ENCRYPTION_PREVIOUS_KEYS` | 鍵の入れ替えの間だけ。前の鍵（カンマ区切り）。開くときだけ使い、全部閉じ直したら外す |
| Supabase secrets | `GOOGLE_CLIENT_ID`・`GOOGLE_CLIENT_SECRET` | カレンダー連携（`google-calendar`） |
| Supabase secrets | `VAPID_PUBLIC_KEY`・`VAPID_PRIVATE_KEY`・`VAPID_SUBJECT` | 通知の送信 |
| Supabase secrets と Vault | `CRON_SECRET` / `chronograma_cron_secret` | cron から `daily-reminders` を呼ぶ |

`vercel.json` の CSP の `connect-src` は Supabase のプロジェクトの URL を書いている。プロジェクトやドメインを変えたら書き換える。

## 3. ログイン

- **Google でログイン**（主のボタン）: Supabase の Authentication → Providers → Google を有効にし、Google Cloud の Web クライアントの Authorized redirect URIs に `https://<project-ref>.supabase.co/auth/v1/callback` を入れる。求める権限はメールアドレスと名前・プロフィール画像だけ
- **メールのリンク**（控えめの選択肢）: Supabase の標準のメール送信は 1 時間に送れる数がごく少ない。人数が増えたら Authentication → Emails → SMTP Settings で自前の SMTP（Resend・SendGrid など）を設定し、Authentication → Rate Limits でメールの上限を上げる（#56）
- Authentication → URL Configuration の Site URL と Redirect URLs に本番のオリジンを入れる

## 4. Google の OAuth 同意画面と審査

ログインとカレンダー連携は同じ Google Cloud のプロジェクト（同じ同意画面）を使う。

- **公開ステータスが「テスト」のあいだ**: 同意画面に登録したテストユーザーだけが、ログインもカレンダー連携もできる。友達のうちは Google アカウントをテストユーザーに足す（OAuth 同意画面 → Audience → Test users）。テストの間に発行されたカレンダーの許可は、一定期間で切れてつなぎ直しになることがある（Google の画面で条件を確かめる）
- **「本番」に切り替えたあと**: ログインだけ（メール・プロフィール）は審査なしで誰でも使える。カレンダーの権限（`calendar.events.owned`・`calendar.calendarlist.readonly`）は審査が通るまで「Google はこのアプリを確認していません」の警告が出て、使える人数にも上限がある
- **審査に出すもの**（#23〜25）:
  1. プライバシーポリシーと利用規約を独自ドメインで公開する（`public/privacy.html`・`public/terms.html`）。同意画面のアプリのホームページ・ポリシーの URL もそのドメインにする
  2. 権限ごとの理由: [`GOOGLE_VERIFICATION.md`](./GOOGLE_VERIFICATION.md) の英文をそのまま貼る
  3. デモ動画: 同意画面での許可 → 今日・カレンダーに予定が出る → 空き時間から Google の予定を作る → 動かす・名前を変える・消す、の順に、画面と同意画面の URL が映るように撮る

## 5. Supabase のプランとバックアップ

- Free プランは自動バックアップが無く、しばらく使われないとプロジェクトが一時停止する。人のデータを預かるなら毎日のバックアップがあるプラン（Pro 以上）にするか、`supabase db dump` で自分で控えを取る（README「バックアップ」）
- 端末の中にも自動の控えがある（`src/lib/autoBackup.ts`。設定のバックアップから戻せる）

## 6. 出した後に見るところ

- 端末のエラー: `client_errors` の表（見る SQL は [`CURSOR_CONTEXT.md`](./CURSOR_CONTEXT.md) の「端末のエラー」の節）
- 通知の cron: `net._http_response` の 200 以外（cron の実行記録は呼び出しが非同期なので常に成功と残る）
- CI: `.github/workflows/ci.yml` の check・functions・database の 3 つ
