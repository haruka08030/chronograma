-- Canvas LMS 連携（2026-10）。001 を 2026-10-03 より前に適用した DB に足す。
-- トークンはブラウザに出さないのでポリシーを置かず、Edge Function `canvas` が service_role で読み書きする。
create table if not exists public.canvas_connection (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  base_url   text not null,  -- 'https://xxx.instructure.com'
  token      text not null,
  user_name  text,
  updated_at timestamptz not null default now()
);

alter table public.canvas_connection enable row level security;  -- ポリシーなし（サーバー専用）
