-- サーバー専用の表と関数: ブラウザ（authenticated / anon）からは読めず、書けず、呼べない。
-- public の全表で RLS が有効。client_errors は本人の insert だけで、1 人 500 件まで（011）、種類は 020。reminder_runs（012、数の列は 021）。
-- hit_rate_limit の search_path は空（013）
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'server-a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'server-b@example.test');

-- A 本人の行（テストの持ち主の権限で入れる）。本人でも読めないことを確かめる
insert into public.google_oauth (user_id, refresh_token) values ('00000000-0000-4000-8000-00000000000a', 'enc:v1:google');
insert into public.notion_connection (user_id, token, database_id) values ('00000000-0000-4000-8000-00000000000a', 'enc:v1:notion', 'db');
insert into public.canvas_connection (user_id, id, base_url, token)
values ('00000000-0000-4000-8000-00000000000a', 'school.instructure.com', 'https://school.instructure.com', 'enc:v1:canvas');
insert into public.edge_rate_limits (user_id, bucket, hits) values ('00000000-0000-4000-8000-00000000000a', 'notion', 3);

-- public の全表で RLS が有効
select is_empty(
  $$select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity$$,
  'public の全表で RLS が有効');

-- hit_rate_limit: ブラウザからは呼べない。search_path は空。動きは 001 と同じ
select ok(not has_function_privilege('authenticated', 'public.hit_rate_limit(uuid, text, integer, integer)', 'execute'),
  'authenticated は hit_rate_limit を呼べない');
select ok(not has_function_privilege('anon', 'public.hit_rate_limit(uuid, text, integer, integer)', 'execute'),
  'anon は hit_rate_limit を呼べない');
select ok(has_function_privilege('service_role', 'public.hit_rate_limit(uuid, text, integer, integer)', 'execute'),
  'service_role は hit_rate_limit を呼べる');
select is(
  (select proconfig from pg_catalog.pg_proc where oid = 'public.hit_rate_limit(uuid, text, integer, integer)'::regprocedure),
  array['search_path=""'],
  'hit_rate_limit の search_path は空');
select is(public.hit_rate_limit('00000000-0000-4000-8000-00000000000b', 'test', 2, 60), true, '上限以内は true（1 回目）');
select is(public.hit_rate_limit('00000000-0000-4000-8000-00000000000b', 'test', 2, 60), true, '上限以内は true（2 回目）');
select is(public.hit_rate_limit('00000000-0000-4000-8000-00000000000b', 'test', 2, 60), false, '上限を超えたら false');

-- ブラウザ（A としてログイン）
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.google_oauth), 0::bigint, 'A は自分の google_oauth も読めない');
select is((select count(*) from public.notion_connection), 0::bigint, 'A は自分の notion_connection も読めない');
select is((select count(*) from public.canvas_connection), 0::bigint, 'A は自分の canvas_connection も読めない');
select is((select count(*) from public.edge_rate_limits), 0::bigint, 'A は自分の edge_rate_limits も読めない');

select throws_ok(
  $$insert into public.google_oauth (user_id, refresh_token) values ('00000000-0000-4000-8000-00000000000b', 'x')$$,
  '42501', null, 'A は google_oauth に入れられない');
select throws_ok(
  $$insert into public.notion_connection (user_id, token, database_id) values ('00000000-0000-4000-8000-00000000000b', 'x', 'db')$$,
  '42501', null, 'A は notion_connection に入れられない');
select throws_ok(
  $$insert into public.canvas_connection (user_id, id, base_url, token) values ('00000000-0000-4000-8000-00000000000b', 'x.instructure.com', 'https://x.instructure.com', 'x')$$,
  '42501', null, 'A は canvas_connection に入れられない');
select throws_ok(
  $$insert into public.edge_rate_limits (user_id, bucket) values ('00000000-0000-4000-8000-00000000000a', 'other')$$,
  '42501', null, 'A は edge_rate_limits に入れられない');

-- 見えない行の更新・削除は 0 行（エラーにはならない）。後で行が変わっていないことを確かめる
select lives_ok($$update public.google_oauth set refresh_token = 'by A'$$, 'google_oauth の更新は 0 行');
select lives_ok($$update public.notion_connection set token = 'by A'$$, 'notion_connection の更新は 0 行');
select lives_ok($$update public.canvas_connection set token = 'by A'$$, 'canvas_connection の更新は 0 行');
select lives_ok($$update public.edge_rate_limits set hits = 0$$, 'edge_rate_limits の更新は 0 行');
select lives_ok($$delete from public.google_oauth$$, 'google_oauth の削除は 0 行');
select lives_ok($$delete from public.notion_connection$$, 'notion_connection の削除は 0 行');
select lives_ok($$delete from public.canvas_connection$$, 'canvas_connection の削除は 0 行');
select lives_ok($$delete from public.edge_rate_limits$$, 'edge_rate_limits の削除は 0 行');

select throws_ok(
  $$select public.hit_rate_limit('00000000-0000-4000-8000-00000000000a', 'notion', 1000, 60)$$,
  '42501', null, 'A は hit_rate_limit を呼べない');

-- reminder_runs（012）: 読めず、書けない
select throws_ok($$select * from public.reminder_runs$$, '42501', null, 'A は reminder_runs を読めない');
select throws_ok($$update public.reminder_runs set last_ok_at = now()$$, '42501', null, 'A は reminder_runs を書けない');

-- client_errors（011）: 本人の行の insert だけ
select lives_ok(
  $$insert into public.client_errors (kind, message) values ('error', 'first')$$,
  'A は自分の client_errors を入れられる');
select lives_ok(
  $$insert into public.client_errors (kind, message) values ('storage', 'k1'), ('integration', 'k2'), ('push', 'k3')$$,
  'A は保存・連携・通知の購読の失敗を入れられる（020）');
select throws_ok(
  $$insert into public.client_errors (kind, message) values ('bogus', 'x')$$,
  '23514', null, '決まっていない種類は入れられない');
select throws_ok(
  $$insert into public.client_errors (user_id, kind, message) values ('00000000-0000-4000-8000-00000000000b', 'error', 'as B')$$,
  '42501', null, 'A は B の client_errors を入れられない');
select throws_ok(
  $$insert into public.client_errors (kind, message, created_at) values ('error', 'old', '2000-01-01T00:00:00Z')$$,
  '42501', null, 'A は client_errors の created_at を決められない');
select throws_ok($$select * from public.client_errors$$, '42501', null, 'A は client_errors を読めない');
select throws_ok($$update public.client_errors set message = 'x'$$, '42501', null, 'A は client_errors を変えられない');
select throws_ok($$delete from public.client_errors$$, '42501', null, 'A は client_errors を消せない');

-- 1 人 500 件まで。first・k1〜k3 と m1〜m505 の 509 件を入れると、古い 9 件（first・k1〜k3・m1〜m5）が消える
select lives_ok(
  $$insert into public.client_errors (kind, message) select 'error', 'm' || g from generate_series(1, 505) g$$,
  'A は 505 件まとめて入れられる（断らない）');
reset role;

select is(
  (select count(*) from public.client_errors where user_id = '00000000-0000-4000-8000-00000000000a'),
  500::bigint, 'client_errors は新しい 500 件だけ残る');
select is(
  (select message from public.client_errors where user_id = '00000000-0000-4000-8000-00000000000a' order by id limit 1),
  'm6', '残るのは新しいほう（一番古いのは m6）');
select is(
  (select message from public.client_errors where user_id = '00000000-0000-4000-8000-00000000000a' order by id desc limit 1),
  'm505', '一番新しい行は残る');

-- A の更新・削除で、サーバー専用の表の行は変わっていない
select is((select refresh_token from public.google_oauth), 'enc:v1:google', 'google_oauth は変わっていない');
select is((select token from public.notion_connection), 'enc:v1:notion', 'notion_connection は変わっていない');
select is((select token from public.canvas_connection), 'enc:v1:canvas', 'canvas_connection は変わっていない');
select is(
  (select hits from public.edge_rate_limits where user_id = '00000000-0000-4000-8000-00000000000a' and bucket = 'notion'),
  3, 'edge_rate_limits は変わっていない');
select is((select count(*) from public.reminder_runs where id = 1), 1::bigint, 'reminder_runs の 1 行はある');
select has_column('public', 'reminder_runs', 'last_failed_at', 'reminder_runs に最後の回の数と失敗の時刻がある（021）');

-- anon（ログインしていない）
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select count(*) from public.google_oauth), 0::bigint, 'anon は google_oauth を読めない');
select is((select count(*) from public.notion_connection), 0::bigint, 'anon は notion_connection を読めない');
select is((select count(*) from public.canvas_connection), 0::bigint, 'anon は canvas_connection を読めない');
select is((select count(*) from public.edge_rate_limits), 0::bigint, 'anon は edge_rate_limits を読めない');
select throws_ok(
  $$insert into public.edge_rate_limits (user_id, bucket) values ('00000000-0000-4000-8000-00000000000a', 'anon')$$,
  '42501', null, 'anon は edge_rate_limits に入れられない');
select throws_ok(
  $$select public.hit_rate_limit('00000000-0000-4000-8000-00000000000a', 'notion', 1000, 60)$$,
  '42501', null, 'anon は hit_rate_limit を呼べない');
select throws_ok($$select * from public.reminder_runs$$, '42501', null, 'anon は reminder_runs を読めない');
select throws_ok($$select * from public.client_errors$$, '42501', null, 'anon は client_errors を読めない');
select throws_ok(
  $$insert into public.client_errors (user_id, kind, message) values ('00000000-0000-4000-8000-00000000000a', 'error', 'anon')$$,
  '42501', null, 'anon は client_errors に入れられない');
reset role;

select * from finish();
rollback;
