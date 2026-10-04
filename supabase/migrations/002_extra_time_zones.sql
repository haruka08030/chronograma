-- 時間バーに並べる他のタイムゾーン（並びと、利用者が付けた名前）を端末間で同期する。
-- - user_extra_time_zones: 利用者ごとに 1 行。zones は [{ "tz": "Europe/London", "label": "ロンドンの友達" }] の並び（label は空でもよい）
-- - ラベル表（user_settings）とは別の行にする: どちらが新しいかを別々に比べるため（skip_stale_write は行の updated_at で比べる）
-- 何度流しても同じ形になる。

create table if not exists public.user_extra_time_zones (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  zones       jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_extra_time_zones enable row level security;

drop policy if exists user_extra_time_zones_select_own on public.user_extra_time_zones;
create policy user_extra_time_zones_select_own on public.user_extra_time_zones for select using (auth.uid() = user_id);
drop policy if exists user_extra_time_zones_insert_own on public.user_extra_time_zones;
create policy user_extra_time_zones_insert_own on public.user_extra_time_zones for insert with check (auth.uid() = user_id);
drop policy if exists user_extra_time_zones_update_own on public.user_extra_time_zones;
create policy user_extra_time_zones_update_own on public.user_extra_time_zones for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists user_extra_time_zones_delete_own on public.user_extra_time_zones;
create policy user_extra_time_zones_delete_own on public.user_extra_time_zones for delete using (auth.uid() = user_id);

-- 大きさの上限（005 と同じ考え方。タイムゾーンは 2 つまで・名前は 40 字まで）
alter table public.user_extra_time_zones drop constraint if exists user_extra_time_zones_size_check;
alter table public.user_extra_time_zones add constraint user_extra_time_zones_size_check
  check (octet_length(zones::text) <= 4000);

-- 古い書き込みは捨てる（010 と同じ）
drop trigger if exists skip_stale_write on public.user_extra_time_zones;
create trigger skip_stale_write before update on public.user_extra_time_zones
  for each row execute function public.skip_stale_write();
