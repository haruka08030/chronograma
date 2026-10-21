-- 040: 夢の一歩の元の夢 tasks.dream_id
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select has_column('public', 'tasks', 'dream_id', 'tasks に dream_id がある');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000002b', 'dream-a@example.test');
insert into public.lists (user_id, id, name, updated_at)
values ('00000000-0000-4000-8000-00000000002b', '__inbox__', '未分類', '2020-01-01T00:00:00Z');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000002b","role":"authenticated"}', true);
set local role authenticated;

insert into public.tasks (user_id, id, list_id, title, dream_id, base_updated_at)
values ('00000000-0000-4000-8000-00000000002b', 's1', '__inbox__', 'HSK に申し込む', 'd1', '-infinity');
select is((select dream_id from public.tasks where id = 's1'), 'd1', '元の夢を書ける');

-- 列を含まない書き込み（前の版のアプリ）はつながりに触れない
select set_config('test.v1', (select updated_at::text from public.tasks where id = 's1'), true);
insert into public.tasks (user_id, id, list_id, title, base_updated_at)
values ('00000000-0000-4000-8000-00000000002b', 's1', '__inbox__', 'HSK 4 級に申し込む', current_setting('test.v1')::timestamptz)
on conflict (user_id, id) do update set title = excluded.title, base_updated_at = excluded.base_updated_at;
select is((select dream_id from public.tasks where id = 's1'), 'd1', '前の版の書き込みでもつながりは残る');

select throws_ok(
  $$update public.tasks set dream_id = '', base_updated_at = updated_at where id = 's1'$$,
  '23514', null, '空の id は入れられない');
reset role;

select * from finish();
rollback;
