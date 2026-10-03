-- 記録の分類（ラベル）を同期する。
-- - tasks.category: 記録の分類名。これまでは tags の先頭を分類として使っていた（To-Do のタグ・Canvas の科目名と混ざる）。
--   既存の記録は tags の先頭から埋める（更新前の端末のため、アプリはしばらく tags にも同じ名前を書く）
-- - user_settings: 利用者ごとに 1 行。log_labels はラベル（分類名と色）の並び。どの端末でも同じラベル表になる
-- 何度流しても同じ形になる。

alter table public.tasks add column if not exists category text;

update public.tasks
set category = tags ->> 0
where is_time_log
  and category is null
  and jsonb_typeof(tags) = 'array'
  and jsonb_array_length(tags) > 0;

create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  log_labels  jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists user_settings_select_own on public.user_settings;
create policy user_settings_select_own on public.user_settings for select using (auth.uid() = user_id);
drop policy if exists user_settings_insert_own on public.user_settings;
create policy user_settings_insert_own on public.user_settings for insert with check (auth.uid() = user_id);
drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_update_own on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists user_settings_delete_own on public.user_settings;
create policy user_settings_delete_own on public.user_settings for delete using (auth.uid() = user_id);

-- 大きさの上限（005 と同じ考え方。ラベルは数十個まで）
alter table public.user_settings drop constraint if exists user_settings_size_check;
alter table public.user_settings add constraint user_settings_size_check
  check (octet_length(log_labels::text) <= 20000);
alter table public.tasks drop constraint if exists tasks_category_size_check;
alter table public.tasks add constraint tasks_category_size_check
  check (category is null or length(category) <= 200) not valid;

-- 古い書き込みは捨てる（010 と同じ）
drop trigger if exists skip_stale_write on public.user_settings;
create trigger skip_stale_write before update on public.user_settings
  for each row execute function public.skip_stale_write();
