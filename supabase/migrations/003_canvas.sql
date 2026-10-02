-- Canvas LMS 連携（2026-10）。001 を 2026-10-03 より前に適用した DB に足す。
-- トークンはブラウザに出さないのでポリシーを置かず、Edge Function `canvas` が service_role で読み書きする。
-- 学校（ホスト名）ごとに 1 行。何度流しても同じ形になる。
create table if not exists public.canvas_connection (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,  -- 学校の Canvas のホスト名 'xxx.instructure.com'
  base_url   text not null,  -- 'https://xxx.instructure.com'
  token      text not null,
  user_name  text,
  -- トークンの期限（null = 期限なしか、分からない）。同期のついでに 1 日 1 回確かめて、近ければ延ばす
  token_expires_at timestamptz,
  token_checked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- 最初の版（1 人 1 つ、主キー user_id）を適用済みなら、学校ごとの行に変える
alter table public.canvas_connection add column if not exists id text;
update public.canvas_connection set id = regexp_replace(base_url, '^https://', '') where id is null;
alter table public.canvas_connection alter column id set not null;
alter table public.canvas_connection drop constraint if exists canvas_connection_pkey;
alter table public.canvas_connection add primary key (user_id, id);
alter table public.canvas_connection
  add column if not exists token_expires_at timestamptz,
  add column if not exists token_checked_at timestamptz;

alter table public.canvas_connection enable row level security;  -- ポリシーなし（サーバー専用）
