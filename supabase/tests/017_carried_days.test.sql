-- 037: To-Do の続けて持ち越した日数 tasks.carried_days
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_column('public', 'tasks', 'carried_days', 'tasks に carried_days がある');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000a', 'carry-a@example.test');
insert into public.lists (user_id, id, name, updated_at)
values ('00000000-0000-4000-8000-00000000000a', '__inbox__', '未分類', '2020-01-01T00:00:00Z');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

-- 列を送らない行は 0
insert into public.tasks (user_id, id, list_id, title, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', 't1', '__inbox__', 'ES', '-infinity');
select is((select carried_days from public.tasks where id = 't1'), 0, '既定は 0');

select set_config('test.v1', (select updated_at::text from public.tasks where id = 't1'), true);
update public.tasks set carried_days = 3, base_updated_at = current_setting('test.v1')::timestamptz where id = 't1';
select is((select carried_days from public.tasks where id = 't1'), 3, '日数を書ける');

-- 列を含まない書き込み（前の版のアプリ）は日数に触れない
select set_config('test.v2', (select updated_at::text from public.tasks where id = 't1'), true);
insert into public.tasks (user_id, id, list_id, title, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', 't1', '__inbox__', 'ES（第一志望）', current_setting('test.v2')::timestamptz)
on conflict (user_id, id) do update set title = excluded.title, base_updated_at = excluded.base_updated_at;
select is((select carried_days from public.tasks where id = 't1'), 3, '前の版の書き込みでは日数が残る');

select throws_ok(
  $$update public.tasks set carried_days = -1, base_updated_at = updated_at where id = 't1'$$,
  '23514',
  null,
  '負の日数は書けない'
);

select * from finish();
rollback;
