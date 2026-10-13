-- 031 の habits.rest_dates / weekday_times / goal_minutes: 列があり、形の決まりを守らない値は入らず、
-- 列を送らない前の版のアプリの upsert では消えない
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select has_column('public', 'habits', 'rest_dates', 'habits に rest_dates');
select has_column('public', 'habits', 'weekday_times', 'habits に weekday_times');
select has_column('public', 'habits', 'goal_minutes', 'habits に goal_minutes');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000a', 'habit-a@example.test');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

-- この版のアプリが 3 つとも付けて入れる
insert into public.habits (user_id, id, title, rest_dates, weekday_times, goal_minutes, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', 'gym', 'ジム', '["2026-10-12","2026-10-13"]',
  '{"1":{"startTime":"18:00","endTime":"19:00"},"6":{"startTime":"10:00","endTime":"11:00"}}', 30, '-infinity');
select is((select rest_dates from public.habits where id = 'gym'), '["2026-10-12","2026-10-13"]'::jsonb, '休みの日が入る');

-- 前の版のアプリが列を送らずに名前を変える
select set_config('test.v1', (select updated_at::text from public.habits where id = 'gym'), true);
insert into public.habits (user_id, id, title, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', 'gym', 'ジム（夜）', current_setting('test.v1')::timestamptz)
on conflict (user_id, id) do update set title = excluded.title, base_updated_at = excluded.base_updated_at;
select is(
  (select (rest_dates is not null and weekday_times ? '6' and goal_minutes = 30) from public.habits where id = 'gym'), true,
  '列を送らない upsert では休み・曜日ごとの時間・目標は消えない');

select throws_ok(
  $$update public.habits set goal_minutes = 0, base_updated_at = updated_at where id = 'gym'$$,
  '23514', null, '0 分の目標は入れられない');
select throws_ok(
  $$update public.habits set goal_minutes = 1441, base_updated_at = updated_at where id = 'gym'$$,
  '23514', null, '1 日より長い目標は入れられない');
select throws_ok(
  $$update public.habits set rest_dates = '{"2026-10-12":true}', base_updated_at = updated_at where id = 'gym'$$,
  '23514', null, '休みの日は並び（array）だけ');
select throws_ok(
  $$update public.habits set weekday_times = '[]', base_updated_at = updated_at where id = 'gym'$$,
  '23514', null, '曜日ごとの時間は object だけ');

select * from finish();
rollback;
