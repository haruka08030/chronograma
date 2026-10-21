-- 041 の user_addons: 追加機能のオン・オフは利用者ごとに 1 行。本人だけが読み書きでき、版が合うときだけ書け（settings_write_guard）、
-- 大きさの上限があり、sync_changes_since の settings と Realtime の publication に入っている
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_table('public', 'user_addons', 'user_addons がある');
select ok((select relrowsecurity from pg_class where oid = 'public.user_addons'::regclass), 'user_addons は RLS が有効');
select policies_are('public', 'user_addons',
  array['user_addons_select_own', 'user_addons_insert_own', 'user_addons_update_own', 'user_addons_delete_own'],
  'user_addons のポリシーは本人の 4 つだけ');
select has_trigger('public', 'user_addons', 'settings_write_guard', 'user_addons に settings_write_guard');
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_addons'),
  'user_addons が publication に入っている');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000004a', 'addons-a@example.test'),
  ('00000000-0000-4000-8000-00000000004b', 'addons-b@example.test');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000004a","role":"authenticated"}', true);
set local role authenticated;

-- 行が無ければ設定の版は null
select is(public.sync_changes_since(now() - interval '1 hour') -> 'settings' -> 'user_addons', 'null'::jsonb, '行が無ければ user_addons の版は null');

-- 初めてオンにする（行が無いはず = -infinity）
insert into public.user_addons (user_id, addons, updated_at, base_updated_at)
values ('00000000-0000-4000-8000-00000000004a', '{"enabled":{"timetable":true}}', '1999-01-01T00:00:00Z', '-infinity');
select is((select updated_at from public.user_addons), now(), '新しい行の updated_at はサーバーの時刻');
select is((select base_updated_at from public.user_addons), null, 'base_updated_at は行に残さない');
select is(
  (public.sync_changes_since(now() - interval '1 hour') -> 'settings' ->> 'user_addons')::timestamptz,
  (select updated_at from public.user_addons),
  'sync_changes_since の settings に user_addons の版が入る');

-- 別の端末が「行が無いはず」で入れても、先に入った行を上書きしない
insert into public.user_addons (user_id, addons, base_updated_at)
values ('00000000-0000-4000-8000-00000000004a', '{"enabled":{"timetable":false}}', '-infinity')
on conflict (user_id) do update set addons = excluded.addons, base_updated_at = excluded.base_updated_at;
select is((select addons -> 'enabled' ->> 'timetable' from public.user_addons), 'true', '行があるのに -infinity をもとにした書き込みは捨てる');

-- 取得した版をもとに変える
select set_config('test.v1', (select updated_at::text from public.user_addons), true);
update public.user_addons set addons = '{"enabled":{"timetable":true,"dues":true}}', base_updated_at = current_setting('test.v1')::timestamptz;
select is((select addons -> 'enabled' ->> 'dues' from public.user_addons), 'true', '版が合う書き込みは通る');

-- 変える前の版をもとにした書き込み（古い画面）は捨てる
update public.user_addons set addons = '{}', base_updated_at = current_setting('test.v1')::timestamptz;
select is((select addons -> 'enabled' ->> 'dues' from public.user_addons), 'true', '古い版をもとにした書き込みは捨てる');

-- 版なしの書き込み（下限より古い版のアプリ）は断る（017）
select throws_ok(
  $$update public.user_addons set addons = '{}', updated_at = '2999-01-01T00:00:00Z'$$,
  'P0001', null, '版なしの書き込みは断る');
-- object でないもの・大きすぎるものは入れられない
select throws_ok(
  $$update public.user_addons set addons = '[]', base_updated_at = updated_at$$,
  '23514', null, 'addons は object');
select throws_ok(
  $$update public.user_addons set addons = jsonb_build_object('big', repeat('x', 262144)), base_updated_at = updated_at$$,
  '23514', null, 'addons は 256KB まで');
-- ほかの人の行としては入れられない
select throws_ok(
  $$insert into public.user_addons (user_id, addons, base_updated_at)
    values ('00000000-0000-4000-8000-00000000004b', '{}', '-infinity')$$,
  '42501', null, 'ほかの人の追加機能は書けない');
reset role;

-- B からは A の行が見えず、変えられない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000004b","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.user_addons), 0, 'ほかの人の追加機能は読めない');
update public.user_addons set addons = '{}', base_updated_at = updated_at;
reset role;
select is((select addons -> 'enabled' ->> 'dues' from public.user_addons), 'true', 'ほかの人の追加機能は変えられない');

select * from finish();
rollback;
