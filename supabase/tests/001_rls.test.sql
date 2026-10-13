-- RLS: 利用者は本人の行だけを読み書きできる。他人の行は見えず、書けず、消せない。anon は何も読めない
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'rls-a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'rls-b@example.test');

-- B の行（テストの持ち主の権限で入れる）
insert into public.lists (user_id, id, name) values ('00000000-0000-4000-8000-00000000000b', 'l1', 'B list');
insert into public.tasks (user_id, id, list_id, title) values
  ('00000000-0000-4000-8000-00000000000b', 't1', 'l1', 'B task'),
  ('00000000-0000-4000-8000-00000000000b', 't2', 'l1', 'B gone');
insert into public.habits (user_id, id, title) values ('00000000-0000-4000-8000-00000000000b', 'h1', 'B habit');
insert into public.user_settings (user_id, log_labels) values ('00000000-0000-4000-8000-00000000000b', '[{"name":"B"}]');
delete from public.tasks where user_id = '00000000-0000-4000-8000-00000000000b' and id = 't2';

-- A として
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.lists), 0::bigint, 'A は B の lists を読めない');
select is((select count(*) from public.tasks), 0::bigint, 'A は B の tasks を読めない');
select is((select count(*) from public.habits), 0::bigint, 'A は B の habits を読めない');
select is((select count(*) from public.user_settings), 0::bigint, 'A は B の user_settings を読めない');
select is((select count(*) from public.sync_tombstones), 0::bigint, 'A は B の sync_tombstones を読めない');

select throws_ok(
  $$insert into public.lists (user_id, id, name, base_updated_at) values ('00000000-0000-4000-8000-00000000000b', 'x', 'by A', '-infinity')$$,
  '42501', null, 'A は B の lists に入れられない');
select throws_ok(
  $$insert into public.tasks (user_id, id, list_id, title, base_updated_at) values ('00000000-0000-4000-8000-00000000000b', 'x', 'l1', 'by A', '-infinity')$$,
  '42501', null, 'A は B の tasks に入れられない');
select throws_ok(
  $$insert into public.habits (user_id, id, title, base_updated_at) values ('00000000-0000-4000-8000-00000000000b', 'x', 'by A', '-infinity')$$,
  '42501', null, 'A は B の habits に入れられない');
select throws_ok(
  $$insert into public.user_settings (user_id, base_updated_at) values ('00000000-0000-4000-8000-00000000000b', '-infinity')$$,
  '42501', null, 'A は B の user_settings に入れられない');

-- 見えない行の更新・削除は 0 行（エラーにはならない）。後で B の行が変わっていないことを確かめる
select lives_ok($$update public.lists set name = 'by A' where user_id = '00000000-0000-4000-8000-00000000000b'$$, 'lists の更新は 0 行');
select lives_ok($$update public.tasks set title = 'by A' where user_id = '00000000-0000-4000-8000-00000000000b'$$, 'tasks の更新は 0 行');
select lives_ok($$update public.habits set title = 'by A' where user_id = '00000000-0000-4000-8000-00000000000b'$$, 'habits の更新は 0 行');
select lives_ok($$update public.user_settings set log_labels = '[]' where user_id = '00000000-0000-4000-8000-00000000000b'$$, 'user_settings の更新は 0 行');
select lives_ok($$delete from public.tasks where user_id = '00000000-0000-4000-8000-00000000000b'$$, 'tasks の削除は 0 行');
select lives_ok($$delete from public.habits where user_id = '00000000-0000-4000-8000-00000000000b'$$, 'habits の削除は 0 行');
select lives_ok($$delete from public.user_settings where user_id = '00000000-0000-4000-8000-00000000000b'$$, 'user_settings の削除は 0 行');

-- 本人の行は書ける・読める
select lives_ok(
  $$insert into public.lists (user_id, id, name, base_updated_at) values ('00000000-0000-4000-8000-00000000000a', 'l1', 'A list', '-infinity')$$,
  'A は自分の lists に入れられる');
select is((select name from public.lists), 'A list', 'A に見えるのは自分の行だけ');

reset role;
select is((select name from public.lists where user_id = '00000000-0000-4000-8000-00000000000b'), 'B list', 'B の lists は変わっていない');
select is((select title from public.tasks where user_id = '00000000-0000-4000-8000-00000000000b'), 'B task', 'B の tasks は変わっていない');
select is((select title from public.habits where user_id = '00000000-0000-4000-8000-00000000000b'), 'B habit', 'B の habits は変わっていない');
select is((select log_labels from public.user_settings where user_id = '00000000-0000-4000-8000-00000000000b'), '[{"name":"B"}]'::jsonb, 'B の user_settings は変わっていない');
select is((select count(*) from public.sync_tombstones where user_id = '00000000-0000-4000-8000-00000000000b'), 1::bigint, 'B の印は残っている');

-- anon（ログインしていない）
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select count(*) from public.lists), 0::bigint, 'anon は lists を読めない');
select is((select count(*) from public.tasks), 0::bigint, 'anon は tasks を読めない');
select is((select count(*) from public.habits), 0::bigint, 'anon は habits を読めない');
select is((select count(*) from public.user_settings), 0::bigint, 'anon は user_settings を読めない');
select is((select count(*) from public.sync_tombstones), 0::bigint, 'anon は sync_tombstones を読めない');
select throws_ok(
  $$insert into public.lists (user_id, id, name, base_updated_at) values ('00000000-0000-4000-8000-00000000000b', 'x', 'by anon', '-infinity')$$,
  '42501', null, 'anon は lists に入れられない');
reset role;

select * from finish();
rollback;
