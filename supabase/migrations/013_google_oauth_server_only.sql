-- Google のリフレッシュトークンをブラウザから読めないようにする。
-- 002 の SELECT ポリシーで、ログイン中のブラウザの JavaScript（XSS や拡張機能を含む）から
-- 長く使えるトークンを読み出せた。アプリは使っておらず（状態の確認は Edge Function 経由）、
-- 読み出したトークンを他人のアカウントに登録させる攻撃の足がかりにもなっていた。
-- notion_connection と同じく、クライアント向けのポリシーを置かない（Edge Function は service_role で読む）。
-- 再実行しても安全。Run after 002.

drop policy if exists google_oauth_select_own on public.google_oauth;
