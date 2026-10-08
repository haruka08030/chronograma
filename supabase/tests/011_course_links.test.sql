-- 024 の user_course_links: 授業の予定と科目のつながりは利用者ごとに 1 行。版が合うときだけ書け（settings_write_guard）、本人だけが読める
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('public', 'user_course_links', 'user_course_links がある');
select has_trigger('public', 'user_course_links', 'settings_write_guard', 'user_course_links に settings_write_guard');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'courses-a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'courses-b@example.test');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

-- 初めてつなぐ（行が無いはず = -infinity）
insert into public.user_course_links (user_id, links, updated_at, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a',
  '[{"title":"情報科学概論","course":"CSE-101"}]', '1999-01-01T00:00:00Z', '-infinity')
on conflict (user_id) do update set links = excluded.links, base_updated_at = excluded.base_updated_at;
select is((select updated_at from public.user_course_links), now(), '新しい行の updated_at はサーバーの時刻');
select is((select base_updated_at from public.user_course_links), null, 'base_updated_at は行に残さない');

-- 別の端末が同じ時に「行が無いはず」で書いても、先に入った行を上書きしない
insert into public.user_course_links (user_id, links, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', '[]', '-infinity')
on conflict (user_id) do update set links = excluded.links, base_updated_at = excluded.base_updated_at;
select is(jsonb_array_length((select links from public.user_course_links)), 1, '行があるのに -infinity をもとにした書き込みは捨てる');

-- 取得した版をもとに足す
select set_config('test.v1', (select updated_at::text from public.user_course_links), true);
update public.user_course_links
   set links = links || '[{"title":"バイト","course":""}]',
       base_updated_at = current_setting('test.v1')::timestamptz;
select is(jsonb_array_length((select links from public.user_course_links)), 2, '版が合う書き込みは通る');

-- 足す前の版をもとにした書き込み（古い画面）は捨てる
update public.user_course_links set links = '[]', base_updated_at = current_setting('test.v1')::timestamptz;
select is(jsonb_array_length((select links from public.user_course_links)), 2, '古い版をもとにした書き込みは捨てる');

-- 版なしの書き込み（下限より古い版のアプリ）は断る（017）
select throws_ok(
  $$update public.user_course_links set links = '[]', updated_at = '2999-01-01T00:00:00Z'$$,
  'P0001', null, '版なしの書き込みは断る');
-- 並びでない値は入れられない
select throws_ok(
  $$update public.user_course_links set links = '{}', base_updated_at = updated_at$$,
  '23514', null, 'links は並び');
reset role;

-- B からは A のつながりが見えない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.user_course_links), 0, 'ほかの人のつながりは読めない');
reset role;

select * from finish();
rollback;
