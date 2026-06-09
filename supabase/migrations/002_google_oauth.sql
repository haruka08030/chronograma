-- Google OAuth refresh token storage (server-side refresh via Edge Function)
-- Run after 001_chronograma_schema.sql

create table if not exists public.google_oauth (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  scope text not null default 'https://www.googleapis.com/auth/calendar.readonly',
  updated_at timestamptz not null default now()
);

alter table public.google_oauth enable row level security;

drop policy if exists google_oauth_select_own on public.google_oauth;
create policy google_oauth_select_own on public.google_oauth
  for select using (auth.uid() = user_id);

drop policy if exists google_oauth_delete_own on public.google_oauth;
create policy google_oauth_delete_own on public.google_oauth
  for delete using (auth.uid() = user_id);

-- No insert/update policies for clients; Edge Function uses service_role.
