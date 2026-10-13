-- 007 の settings_write_guard: user_settings / user_extra_time_zones も、版が合うときだけ書き、updated_at はサーバーの時刻
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select has_trigger('public', t, 'settings_write_guard', t || ' に settings_write_guard')
from unnest(array['user_settings', 'user_extra_time_zones']) t;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000a', 'settings-a@example.test');
insert into public.user_settings (user_id, log_labels, updated_at)
values ('00000000-0000-4000-8000-00000000000a', '[{"name":"v0"}]', '2020-01-01T00:00:00Z');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

insert into public.user_settings (user_id, log_labels, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', '[{"name":"v1"}]', '2020-01-01T00:00:00Z')
on conflict (user_id) do update set log_labels = excluded.log_labels, base_updated_at = excluded.base_updated_at;
select is((select log_labels from public.user_settings), '[{"name":"v1"}]'::jsonb, '版が合う書き込みは通る');
select is((select updated_at from public.user_settings), now(), 'updated_at はサーバーの時刻');
select is((select base_updated_at from public.user_settings), null, 'base_updated_at は行に残さない');

insert into public.user_settings (user_id, log_labels, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', '[{"name":"stale"}]', '2020-01-01T00:00:00Z')
on conflict (user_id) do update set log_labels = excluded.log_labels, base_updated_at = excluded.base_updated_at;
select is((select log_labels from public.user_settings), '[{"name":"v1"}]'::jsonb, '古い版をもとにした書き込みは捨てる');

-- 行が無いはずのとき（-infinity）: 新しく入れ、updated_at はサーバーの時刻
insert into public.user_extra_time_zones (user_id, zones, updated_at, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', '[{"tz":"Europe/London","label":""}]', '1999-01-01T00:00:00Z', '-infinity')
on conflict (user_id) do update set zones = excluded.zones, base_updated_at = excluded.base_updated_at;
select is((select updated_at from public.user_extra_time_zones), now(), '新しい行の updated_at はサーバーの時刻');

-- 他の端末が先に入れていたら（-infinity は今の版と違う）捨てる
insert into public.user_extra_time_zones (user_id, zones, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', '[]', '-infinity')
on conflict (user_id) do update set zones = excluded.zones, base_updated_at = excluded.base_updated_at;
select is(
  (select zones from public.user_extra_time_zones), '[{"tz":"Europe/London","label":""}]'::jsonb,
  '行があるのに -infinity をもとにした書き込みは捨てる');

-- 版を送らない書き込み（下限より古い版のアプリ）は断る（017）
select throws_ok(
  $$update public.user_settings set log_labels = '[]', updated_at = '2999-01-01T00:00:00Z'$$,
  'P0001', null, '版なしの書き込みは断る');
reset role;

select * from finish();
rollback;
