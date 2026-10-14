-- Google のアクセストークン（1 時間ほど使える）を使い回す（#421）。予定を読むたびにリフレッシュトークンから作り直していた。
-- - access_token はリフレッシュトークンと同じく enc:v2: の暗号文（`supabase/functions/_shared/secretBox.ts`）。ポリシーは無いまま（サーバー専用）
-- - 期限が近い・無い・開けないときは関数が作り直して上書きする。つなぎ直し（exchange）では空にする
-- 何度流しても同じ形になる。
alter table public.google_oauth add column if not exists access_token text;
alter table public.google_oauth add column if not exists access_token_expires_at timestamptz;
