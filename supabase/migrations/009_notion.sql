-- Notion integration: one database per user whose "needs action" rows become tasks.
-- The integration secret stays server-side (Edge Function `notion` uses service_role). Run after 001.

create table if not exists public.notion_connection (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null,
  database_id text not null,
  -- { statusProperty, dateProperty, actionStatuses: string[], nextStatus: { [from]: to } }
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.notion_connection enable row level security;

-- No client policies: the token must never reach the browser. Only the Edge Function reads/writes.
