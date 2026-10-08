-- 授業の予定の名前と LMS（Canvas・Moodle）の科目のつながり（#309）を端末間で同期する。
-- - user_course_links: 利用者ごとに 1 行。links は
--   [{ "title": "情報科学概論", "course": "CSE-101" }] の並び（title は予定の名前、course は取り込んだ課題の科目のタグ。'' は「つながない」）
-- - 予定を押したカードに、つながった科目の未完了の課題を締切順に出す。課題そのものは tasks にある
-- - 書き込みは 007 / 017 の settings_write_guard で確かめる（base_updated_at の版が合うときだけ通し、updated_at はサーバーの時刻）
-- 既にある行の値は変えない。何度流しても同じ形になる。

create table if not exists public.user_course_links (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  links            jsonb not null default '[]'::jsonb,
  updated_at       timestamptz not null default now(),
  base_updated_at  timestamptz
);

alter table public.user_course_links enable row level security;

drop policy if exists user_course_links_select_own on public.user_course_links;
create policy user_course_links_select_own on public.user_course_links for select using (auth.uid() = user_id);
drop policy if exists user_course_links_insert_own on public.user_course_links;
create policy user_course_links_insert_own on public.user_course_links for insert with check (auth.uid() = user_id);
drop policy if exists user_course_links_update_own on public.user_course_links;
create policy user_course_links_update_own on public.user_course_links for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists user_course_links_delete_own on public.user_course_links;
create policy user_course_links_delete_own on public.user_course_links for delete using (auth.uid() = user_id);

-- 大きさの上限（アプリでは 200 件・名前 100 字まで。それより十分大きく取る）。並びであること
alter table public.user_course_links drop constraint if exists user_course_links_size_check;
alter table public.user_course_links add constraint user_course_links_size_check
  check (jsonb_typeof(links) = 'array' and octet_length(links::text) <= 262144);

-- 版の確かめ（007 / 017 の settings_write_guard。行は user_id だけで決まる）
drop trigger if exists settings_write_guard on public.user_course_links;
create trigger settings_write_guard before insert or update on public.user_course_links
  for each row execute function public.settings_write_guard();
