-- List sections (TickTick-style). Run after 001.

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

alter table public.tasks
  add column if not exists section_id text references public.list_sections (id) on delete set null;

create index if not exists tasks_section_id_idx on public.tasks (section_id);

alter table public.list_sections enable row level security;

create policy "list_sections_select_own" on public.list_sections for select using (auth.uid() = user_id);
create policy "list_sections_insert_own" on public.list_sections for insert with check (auth.uid() = user_id);
create policy "list_sections_update_own" on public.list_sections for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "list_sections_delete_own" on public.list_sections for delete using (auth.uid() = user_id);
