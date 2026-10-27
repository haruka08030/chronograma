-- 050 の habits.ended_on: 列があり、送らなければ null、列を送らない前の版のアプリの upsert では消えない
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select has_column('public', 'habits', 'ended_on', 'habits に ended_on');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000d', 'habit-ended@example.test');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
set local role authenticated;

insert into public.habits (user_id, id, title, base_updated_at)
values ('00000000-0000-4000-8000-00000000000d', 'gym', 'ジム', '-infinity');
select is((select ended_on from public.habits where id = 'gym'), null::date, '送らなければ無し');

insert into public.habits (user_id, id, title, archived_at, ended_on, base_updated_at)
values ('00000000-0000-4000-8000-00000000000d', 'run', '走る', '2026-10-27T01:00:00Z', '2026-10-27', '-infinity');
select is((select ended_on from public.habits where id = 'run'), '2026-10-27'::date, 'やめた日が入る');

select set_config('test.v1', (select updated_at::text from public.habits where id = 'run'), true);
insert into public.habits (user_id, id, title, base_updated_at)
values ('00000000-0000-4000-8000-00000000000d', 'run', '朝に走る', current_setting('test.v1')::timestamptz)
on conflict (user_id, id) do update set title = excluded.title, base_updated_at = excluded.base_updated_at;
select is((select ended_on from public.habits where id = 'run'), '2026-10-27'::date, '列を送らない upsert では消えない');

select * from finish();
rollback;
