-- 049 の user_my_event_times: Google の予定の自分の時間は利用者ごとに 1 行。本人だけが読み書きでき、版が合うときだけ書け（settings_write_guard）、
-- 大きさの上限があり、sync_changes_since の settings と Realtime の publication に入っている
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_table('public', 'user_my_event_times', 'user_my_event_times がある');
select ok((select relrowsecurity from pg_class where oid = 'public.user_my_event_times'::regclass), 'user_my_event_times は RLS が有効');
select policies_are('public', 'user_my_event_times',
  array['user_my_event_times_select_own', 'user_my_event_times_insert_own', 'user_my_event_times_update_own', 'user_my_event_times_delete_own'],
  'user_my_event_times のポリシーは本人の 4 つだけ');
select has_trigger('public', 'user_my_event_times', 'settings_write_guard', 'user_my_event_times に settings_write_guard');
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_my_event_times'),
  'user_my_event_times が publication に入っている');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000005a', 'my-times-a@example.test'),
  ('00000000-0000-4000-8000-00000000005b', 'my-times-b@example.test');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000005a","role":"authenticated"}', true);
set local role authenticated;

-- 行が無ければ設定の版は null
select is(public.sync_changes_since(now() - interval '1 hour') -> 'settings' -> 'user_my_event_times', 'null'::jsonb, '行が無ければ user_my_event_times の版は null');

-- 初めて自分の時間を付ける（行が無いはず = -infinity）
insert into public.user_my_event_times (user_id, times, updated_at, base_updated_at)
values ('00000000-0000-4000-8000-00000000005a', '[{"id":"a"}]', '1999-01-01T00:00:00Z', '-infinity');
select is((select updated_at from public.user_my_event_times), now(), '新しい行の updated_at はサーバーの時刻');
select is((select base_updated_at from public.user_my_event_times), null, 'base_updated_at は行に残さない');
select is(
  (public.sync_changes_since(now() - interval '1 hour') -> 'settings' ->> 'user_my_event_times')::timestamptz,
  (select updated_at from public.user_my_event_times),
  'sync_changes_since の settings に user_my_event_times の版が入る');

-- 別の端末が「行が無いはず」で入れても、先に入った行を上書きしない
insert into public.user_my_event_times (user_id, times, base_updated_at)
values ('00000000-0000-4000-8000-00000000005a', '[{"id":"b"}]', '-infinity')
on conflict (user_id) do update set times = excluded.times, base_updated_at = excluded.base_updated_at;
select is((select times -> 0 ->> 'id' from public.user_my_event_times), 'a', '行があるのに -infinity をもとにした書き込みは捨てる');

-- 取得した版をもとに変える
select set_config('test.v1', (select updated_at::text from public.user_my_event_times), true);
update public.user_my_event_times set times = '[{"id":"c"}]', base_updated_at = current_setting('test.v1')::timestamptz;
select is((select times -> 0 ->> 'id' from public.user_my_event_times), 'c', '版が合う書き込みは通る');

-- 変える前の版をもとにした書き込み（古い画面）は捨てる
update public.user_my_event_times set times = '[]', base_updated_at = current_setting('test.v1')::timestamptz;
select is((select times -> 0 ->> 'id' from public.user_my_event_times), 'c', '古い版をもとにした書き込みは捨てる');

-- 版なしの書き込み（下限より古い版のアプリ）は断る（017）
select throws_ok(
  $$update public.user_my_event_times set times = '[]', updated_at = '2999-01-01T00:00:00Z'$$,
  'P0001', null, '版なしの書き込みは断る');
-- object でないもの・大きすぎるものは入れられない
select throws_ok(
  $$update public.user_my_event_times set times = '{}', base_updated_at = updated_at$$,
  '23514', null, 'times は並び');
select throws_ok(
  $$update public.user_my_event_times set times = jsonb_build_array(repeat('x', 524288)), base_updated_at = updated_at$$,
  '23514', null, 'times は 512KB まで');
-- ほかの人の行としては入れられない
select throws_ok(
  $$insert into public.user_my_event_times (user_id, times, base_updated_at)
    values ('00000000-0000-4000-8000-00000000005b', '[]', '-infinity')$$,
  '42501', null, 'ほかの人の自分の時間は書けない');
reset role;

-- B からは A の行が見えず、変えられない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000005b","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.user_my_event_times), 0, 'ほかの人の自分の時間は読めない');
update public.user_my_event_times set times = '[]', base_updated_at = updated_at;
reset role;
select is((select times -> 0 ->> 'id' from public.user_my_event_times), 'c', 'ほかの人の自分の時間は変えられない');

select * from finish();
rollback;
