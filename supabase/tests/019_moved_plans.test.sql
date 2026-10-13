-- 032: 移した予定の控え tasks.moved_plans
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_column('public', 'tasks', 'moved_plans', 'tasks に moved_plans がある');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000001a', 'moved-a@example.test');
insert into public.lists (user_id, id, name, updated_at)
values ('00000000-0000-4000-8000-00000000001a', '__inbox__', '未分類', '2020-01-01T00:00:00Z');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000001a","role":"authenticated"}', true);
set local role authenticated;

-- 予定日を移した To-Do（新しい行は -infinity をもとにする）
insert into public.tasks (user_id, id, list_id, title, scheduled_date, moved_plans, base_updated_at)
values ('00000000-0000-4000-8000-00000000001a', 'm1', '__inbox__', 'レポート', '2026-10-05',
  '[{"date":"2026-10-03","startTime":"13:00","endTime":"14:00","to":"2026-10-05"}]', '-infinity');
select is((select moved_plans -> 0 ->> 'to' from public.tasks where id = 'm1'), '2026-10-05', '控えを書ける');

-- 列を含まない書き込み（前の版のアプリ）は控えに触れない
select set_config('test.v1', (select updated_at::text from public.tasks where id = 'm1'), true);
insert into public.tasks (user_id, id, list_id, title, base_updated_at)
values ('00000000-0000-4000-8000-00000000001a', 'm1', '__inbox__', 'レポート（第 2 章）', current_setting('test.v1')::timestamptz)
on conflict (user_id, id) do update set title = excluded.title, base_updated_at = excluded.base_updated_at;
select is((select jsonb_array_length(moved_plans) from public.tasks where id = 'm1'), 1, '前の版の書き込みでも控えは残る');

-- 配列でない値・大きすぎる値は入れられない
select throws_ok(
  $$update public.tasks set moved_plans = '{"date":"2026-10-03"}', base_updated_at = updated_at where id = 'm1'$$,
  '23514', null, '控えは配列');
select throws_ok(
  $$update public.tasks set moved_plans = (select jsonb_agg(jsonb_build_object('date', '2026-10-03', 'to', repeat('x', 100))) from generate_series(1, 100)),
    base_updated_at = updated_at where id = 'm1'$$,
  '23514', null, '控えは 8KB まで');
reset role;

select * from finish();
rollback;
