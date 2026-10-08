-- 023 の app_versions_seen: 版の記録は note_app_version からだけ書ける（本人の行・サーバーの時刻・何度呼んでも 1 行）。
-- 端末からは表を読めず書けない。1 人 20 行まで
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select has_table('public', 'app_versions_seen', 'app_versions_seen がある');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.app_versions_seen'::regclass), 'RLS が有効');
select ok(has_function_privilege('authenticated', 'public.note_app_version(text, integer)', 'execute'),
  'authenticated は note_app_version を呼べる');
select ok(not has_function_privilege('anon', 'public.note_app_version(text, integer)', 'execute'),
  'anon は note_app_version を呼べない');
select is(
  (select proconfig from pg_catalog.pg_proc where oid = 'public.note_app_version(text, integer)'::regprocedure),
  array['search_path=""'],
  'note_app_version の search_path は空');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'versions-a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'versions-b@example.test');

-- B の行（テストの持ち主の権限で入れる）。A から見えない・変えられないことを確かめる
insert into public.app_versions_seen (user_id, app_version, sync_protocol_version)
values ('00000000-0000-4000-8000-00000000000b', '0.9.0', 1);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

select lives_ok($$select public.note_app_version('1.0.0+abc', 1)$$, '本人として呼べる');
select lives_ok($$select public.note_app_version('1.0.0+abc', 1)$$, '同じ版で何度呼んでもよい');
select throws_ok($$select count(*) from public.app_versions_seen$$, '42501', null, '表は読めない');
select throws_ok(
  $$insert into public.app_versions_seen (user_id, app_version, sync_protocol_version) values ('00000000-0000-4000-8000-00000000000a', 'x', 1)$$,
  '42501', null, '表には直接書けない');
select throws_ok($$select public.note_app_version(repeat('v', 101), 1)$$, '23514', null, '長すぎる版は断る');
select throws_ok($$select public.note_app_version('1.0.0', -1)$$, '23514', null, '負の取り決めの版は断る');
reset role;

select is((select count(*)::int from public.app_versions_seen where user_id = '00000000-0000-4000-8000-00000000000a'), 1,
  '同じ版は何度呼んでも 1 行');
select is(
  (select last_seen from public.app_versions_seen where user_id = '00000000-0000-4000-8000-00000000000a'),
  now(), 'last_seen はサーバーの時刻');
select is((select count(*)::int from public.app_versions_seen where user_id = '00000000-0000-4000-8000-00000000000b'), 1,
  '別の人の行は変わらない');

-- ログインしていなければ断る
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select throws_ok($$select public.note_app_version('1.0.0', 1)$$, '42501', null, 'ログインしていなければ断る');
reset role;

-- 1 人 20 行まで（last_seen の古いものから消す）。古い時刻にした行を 25 行入れてから呼ぶ
insert into public.app_versions_seen (user_id, app_version, sync_protocol_version, first_seen, last_seen)
select '00000000-0000-4000-8000-00000000000a', 'old-' || g, 1, now() - make_interval(days => g), now() - make_interval(days => g)
from generate_series(1, 25) g;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select public.note_app_version('1.0.1', 1);
reset role;
select is((select count(*)::int from public.app_versions_seen where user_id = '00000000-0000-4000-8000-00000000000a'), 20,
  '1 人 20 行まで');
select ok(
  not exists (select 1 from public.app_versions_seen where user_id = '00000000-0000-4000-8000-00000000000a' and app_version = 'old-25')
  and exists (select 1 from public.app_versions_seen where user_id = '00000000-0000-4000-8000-00000000000a' and app_version = '1.0.1'),
  '消すのは last_seen の古い行');

select * from finish();
rollback;
