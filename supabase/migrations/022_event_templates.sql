-- よく入れる予定（バイトのシフトの「早番 9:00–15:00」など、#311）を端末間で同期する。
-- - user_event_templates: 利用者ごとに 1 行。templates は
--   [{ "id": "…", "title": "早番", "startTime": "09:00", "endTime": "15:00", "color": "#039BE5" | null }] の並び
-- - 月表示で日を押して入れた予定は、ふつうの予定（tasks.is_event）として tasks に入る。この表は登録したものの並びだけ
-- - 書き込みは 007 / 017 の settings_write_guard で確かめる（base_updated_at の版が合うときだけ通し、updated_at はサーバーの時刻）
-- 既にある行の値は変えない。何度流しても同じ形になる。

create table if not exists public.user_event_templates (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  templates        jsonb not null default '[]'::jsonb,
  updated_at       timestamptz not null default now(),
  base_updated_at  timestamptz
);

alter table public.user_event_templates enable row level security;

drop policy if exists user_event_templates_select_own on public.user_event_templates;
create policy user_event_templates_select_own on public.user_event_templates for select using (auth.uid() = user_id);
drop policy if exists user_event_templates_insert_own on public.user_event_templates;
create policy user_event_templates_insert_own on public.user_event_templates for insert with check (auth.uid() = user_id);
drop policy if exists user_event_templates_update_own on public.user_event_templates;
create policy user_event_templates_update_own on public.user_event_templates for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists user_event_templates_delete_own on public.user_event_templates;
create policy user_event_templates_delete_own on public.user_event_templates for delete using (auth.uid() = user_id);

-- 大きさの上限（アプリでは 30 件・名前 100 字まで。それより十分大きく取る）。並びであること
alter table public.user_event_templates drop constraint if exists user_event_templates_size_check;
alter table public.user_event_templates add constraint user_event_templates_size_check
  check (jsonb_typeof(templates) = 'array' and octet_length(templates::text) <= 65536);

-- 版の確かめ（007 / 017 の settings_write_guard。行は user_id だけで決まる）
drop trigger if exists settings_write_guard on public.user_event_templates;
create trigger settings_write_guard before insert or update on public.user_event_templates
  for each row execute function public.settings_write_guard();
