-- 048 の habits.kind: 列があり、送らなければ habit、habit / routine 以外は入らず、列を送らない前の版のアプリの upsert では消えない
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_column('public', 'habits', 'kind', 'habits に kind');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000c', 'habit-kind@example.test');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
set local role authenticated;

insert into public.habits (user_id, id, title, base_updated_at)
values ('00000000-0000-4000-8000-00000000000c', 'gym', 'ジム', '-infinity');
select is((select kind from public.habits where id = 'gym'), 'habit', '送らなければ習慣');

insert into public.habits (user_id, id, title, kind, base_updated_at)
values ('00000000-0000-4000-8000-00000000000c', 'bath', 'お風呂', 'routine', '-infinity');
select is((select kind from public.habits where id = 'bath'), 'routine', 'ルーティンが入る');

select set_config('test.v1', (select updated_at::text from public.habits where id = 'bath'), true);
insert into public.habits (user_id, id, title, base_updated_at)
values ('00000000-0000-4000-8000-00000000000c', 'bath', '夜のお風呂', current_setting('test.v1')::timestamptz)
on conflict (user_id, id) do update set title = excluded.title, base_updated_at = excluded.base_updated_at;
select is((select kind from public.habits where id = 'bath'), 'routine', '列を送らない upsert では消えない');

select throws_ok(
  $$update public.habits set kind = 'chore', base_updated_at = updated_at where id = 'bath'$$,
  '23514', null, '種類は habit / routine だけ');

select * from finish();
rollback;
