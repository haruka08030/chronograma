-- Chronograma: Supabase スキーマ一式（SQL Editor 用・1 ファイルで初期構築）
-- 個人開発向け: 全体をまとめて流す / 再実行時は IF NOT EXISTS と DROP POLICY でなるべく冪等

-- ---------------------------------------------------------------------------
-- lists
-- ---------------------------------------------------------------------------
create table if not exists public.lists (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- list_sections（tasks.section_id より先に必要）
-- ---------------------------------------------------------------------------
create table if not exists public.list_sections (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  list_id text not null references public.lists (id) on delete cascade,
  name text not null default '',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists list_sections_user_id_idx on public.list_sections (user_id);
create index if not exists list_sections_list_id_idx on public.list_sections (list_id);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
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
  is_time_log boolean not null default false,
  section_id text references public.list_sections (id) on delete set null,
  end_date date,
  completed_at timestamptz,
  location text,
  due_time text,
  scheduled_date date,
  archived_at timestamptz,
  deleted_at timestamptz
);

-- 古い DB（列が無い・pinned だけ残っている等）
alter table public.tasks
  add column if not exists section_id text references public.list_sections (id) on delete set null;

alter table public.tasks
  add column if not exists end_date date;

alter table public.tasks
  add column if not exists completed_at timestamptz null;

alter table public.tasks
  add column if not exists location text;

alter table public.tasks
  add column if not exists due_time text;

alter table public.tasks
  add column if not exists scheduled_date date;

alter table public.tasks
  add column if not exists archived_at timestamptz;

alter table public.tasks
  add column if not exists deleted_at timestamptz;

alter table public.tasks
  drop column if exists pinned;

create index if not exists lists_user_id_idx on public.lists (user_id);
create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists tasks_list_id_idx on public.tasks (list_id);
create index if not exists tasks_section_id_idx on public.tasks (section_id);

-- ---------------------------------------------------------------------------
-- habits（time_mode は CREATE に含め、旧行は UPDATE で揃える）
-- ---------------------------------------------------------------------------
create table if not exists public.habits (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  color text not null default '#f97316',
  start_time text,
  end_time text,
  frequency jsonb not null default '{"type":"daily"}'::jsonb,
  completed_dates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  time_mode text not null default 'none'
);

alter table public.habits
  add column if not exists time_mode text not null default 'none';

update public.habits
set time_mode = case
  when start_time is not null and end_time is not null then 'range'
  when start_time is not null and end_time is null then 'fixed'
  else 'none'
end
where time_mode is null
   or time_mode not in ('none', 'fixed', 'range');

alter table public.habits
  drop constraint if exists habits_time_mode_check;

alter table public.habits
  add constraint habits_time_mode_check
  check (time_mode in ('none', 'fixed', 'range'));

create index if not exists habits_user_id_idx on public.habits (user_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.lists enable row level security;
alter table public.tasks enable row level security;
alter table public.habits enable row level security;
alter table public.list_sections enable row level security;

drop policy if exists "lists_select_own" on public.lists;
drop policy if exists "lists_insert_own" on public.lists;
drop policy if exists "lists_update_own" on public.lists;
drop policy if exists "lists_delete_own" on public.lists;
create policy "lists_select_own" on public.lists for select using (auth.uid() = user_id);
create policy "lists_insert_own" on public.lists for insert with check (auth.uid() = user_id);
create policy "lists_update_own" on public.lists for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lists_delete_own" on public.lists for delete using (auth.uid() = user_id);

drop policy if exists "tasks_select_own" on public.tasks;
drop policy if exists "tasks_insert_own" on public.tasks;
drop policy if exists "tasks_update_own" on public.tasks;
drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_select_own" on public.tasks for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks for delete using (auth.uid() = user_id);

drop policy if exists "habits_select_own" on public.habits;
drop policy if exists "habits_insert_own" on public.habits;
drop policy if exists "habits_update_own" on public.habits;
drop policy if exists "habits_delete_own" on public.habits;
create policy "habits_select_own" on public.habits for select using (auth.uid() = user_id);
create policy "habits_insert_own" on public.habits for insert with check (auth.uid() = user_id);
create policy "habits_update_own" on public.habits for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habits_delete_own" on public.habits for delete using (auth.uid() = user_id);

drop policy if exists "list_sections_select_own" on public.list_sections;
drop policy if exists "list_sections_insert_own" on public.list_sections;
drop policy if exists "list_sections_update_own" on public.list_sections;
drop policy if exists "list_sections_delete_own" on public.list_sections;
create policy "list_sections_select_own" on public.list_sections for select using (auth.uid() = user_id);
create policy "list_sections_insert_own" on public.list_sections for insert with check (auth.uid() = user_id);
create policy "list_sections_update_own" on public.list_sections for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "list_sections_delete_own" on public.list_sections for delete using (auth.uid() = user_id);
