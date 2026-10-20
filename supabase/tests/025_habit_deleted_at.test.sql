-- 042: 習慣のゴミ箱 habits.deleted_at
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select has_column('public', 'habits', 'deleted_at', 'habits に deleted_at がある');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000002c', 'habit-trash@example.test');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000002c","role":"authenticated"}', true);
set local role authenticated;

insert into public.habits (user_id, id, title, deleted_at, base_updated_at)
values ('00000000-0000-4000-8000-00000000002c', 'gym', 'ジム', '2026-10-19T00:00:00Z', '-infinity');
select is((select deleted_at from public.habits where id = 'gym'), '2026-10-19T00:00:00Z'::timestamptz, 'ゴミ箱に入れた時刻を書ける');

-- 列を含まない書き込み（前の版のアプリ）はゴミ箱から外さない
select set_config('test.v1', (select updated_at::text from public.habits where id = 'gym'), true);
insert into public.habits (user_id, id, title, base_updated_at)
values ('00000000-0000-4000-8000-00000000002c', 'gym', 'ジム（夜）', current_setting('test.v1')::timestamptz)
on conflict (user_id, id) do update set title = excluded.title, base_updated_at = excluded.base_updated_at;
select isnt((select deleted_at from public.habits where id = 'gym'), null, '前の版の書き込みでもゴミ箱に残る');
reset role;

select * from finish();
rollback;
