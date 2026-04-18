-- Chronograma: lists and tasks with RLS. Run in Supabase SQL Editor or via CLI.

create table if not exists public.lists (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  list_id text not null references public.lists (id) on delete cascade,
  parent_id text,
  title text not null default '',
  description text not null default '',
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sort_order integer not null default 0,
  due_date date,
  start_time text,
  end_time text,
  priority text not null default 'none',
  tags jsonb not null default '[]'::jsonb,
  recurrence jsonb,
  is_time_log boolean not null default false
);

create index if not exists lists_user_id_idx on public.lists (user_id);
create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists tasks_list_id_idx on public.tasks (list_id);

alter table public.lists enable row level security;
alter table public.tasks enable row level security;

create policy "lists_select_own" on public.lists for select using (auth.uid() = user_id);
create policy "lists_insert_own" on public.lists for insert with check (auth.uid() = user_id);
create policy "lists_update_own" on public.lists for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lists_delete_own" on public.lists for delete using (auth.uid() = user_id);

create policy "tasks_select_own" on public.tasks for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks for delete using (auth.uid() = user_id);
