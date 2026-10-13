-- 036 の feedback: お問い合わせ・フィードバックは本人の行の insert だけ（読めない・変えられない・消せない）。
-- ログインしていなければ送れない。文面は 1〜2000 文字、1 人 24 時間に 20 件まで。アカウントを消すと消える
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select has_table('public', 'feedback', 'feedback がある');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.feedback'::regclass), 'RLS が有効');
select is(
  (select proconfig from pg_catalog.pg_proc where oid = 'public.limit_feedback()'::regprocedure),
  array['search_path=""'],
  'limit_feedback の search_path は空');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'feedback-a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'feedback-b@example.test');

-- B の行（テストの持ち主の権限で入れる）。A から見えない・変えられないことを確かめる
insert into public.feedback (user_id, message) values ('00000000-0000-4000-8000-00000000000b', 'from B');

-- ブラウザ（A としてログイン）
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.feedback (message, app_version, user_agent) values ('ボタンが押せません', '1.0.0+abc', 'Mozilla/5.0')$$,
  'A は自分の feedback を送れる');
select throws_ok($$select count(*) from public.feedback$$, '42501', null, 'A は feedback を読めない（自分の行も）');
select throws_ok(
  $$insert into public.feedback (user_id, message) values ('00000000-0000-4000-8000-00000000000b', 'as B')$$,
  '42501', null, 'A は B として送れない');
select throws_ok(
  $$insert into public.feedback (message, created_at) values ('old', '2000-01-01T00:00:00Z')$$,
  '42501', null, 'A は created_at を決められない');
select throws_ok($$update public.feedback set message = 'x'$$, '42501', null, 'A は feedback を変えられない');
select throws_ok($$delete from public.feedback$$, '42501', null, 'A は feedback を消せない');
select throws_ok($$insert into public.feedback (message) values ('   ')$$, '23514', null, '空白だけの文面は断る');
select throws_ok($$insert into public.feedback (message) values (repeat('あ', 2001))$$, '23514', null, '2000 文字を超える文面は断る');
select lives_ok($$insert into public.feedback (message) values (repeat('あ', 2000))$$, '2000 文字までは送れる');
select throws_ok(
  $$insert into public.feedback (message, app_version) values ('x', repeat('v', 101))$$,
  '23514', null, '長すぎる版は断る');
reset role;

select is(
  (select count(*)::int from public.feedback where user_id = '00000000-0000-4000-8000-00000000000a'), 2,
  'A の行は送れた 2 件');
select is(
  (select message from public.feedback where user_id = '00000000-0000-4000-8000-00000000000b'), 'from B',
  'B の行は変わらない');
select is(
  (select created_at from public.feedback where user_id = '00000000-0000-4000-8000-00000000000a' order by id limit 1), now(),
  'created_at はサーバーの時刻');

-- ログインしていなければ送れない
set local role anon;
select throws_ok($$insert into public.feedback (message) values ('anon')$$, '42501', null, 'ログインしていなければ送れない');
reset role;

-- 1 人 24 時間に 20 件まで（A はもう 2 件。あと 18 件は通り、21 件目で断る）。24 時間より前の行は数えない
insert into public.feedback (user_id, message, created_at)
select '00000000-0000-4000-8000-00000000000a', 'yesterday ' || g, now() - interval '25 hours' from generate_series(1, 30) g;
-- 上のトリガーは created_at をサーバーの時刻にするので、昨日の行は後から昨日に戻す
update public.feedback set created_at = now() - interval '25 hours' where message like 'yesterday %';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.feedback (message) select 'more ' || g from generate_series(1, 18) g$$,
  '24 時間に 20 件までは送れる（24 時間より前の行は数えない）');
select throws_ok($$insert into public.feedback (message) values ('one too many')$$, 'P0001', 'feedback_rate_limited',
  '21 件目は断る');
reset role;

-- アカウントを消すと消える
delete from auth.users where id = '00000000-0000-4000-8000-00000000000a';
select is(
  (select count(*)::int from public.feedback where user_id = '00000000-0000-4000-8000-00000000000a'), 0,
  'アカウントを消すと feedback も消える');

select * from finish();
rollback;
