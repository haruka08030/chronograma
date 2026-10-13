-- 034: いつかの段 tasks.someday_tier
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_column('public', 'tasks', 'someday_tier', 'tasks に someday_tier がある');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000002a', 'tier-a@example.test');
insert into public.lists (user_id, id, name, updated_at)
values ('00000000-0000-4000-8000-00000000002a', '__inbox__', '未分類', '2020-01-01T00:00:00Z');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000002a","role":"authenticated"}', true);
set local role authenticated;

insert into public.lists (user_id, id, name, kind, base_updated_at)
values ('00000000-0000-4000-8000-00000000002a', 'wish', 'いつか', 'someday', '-infinity');
insert into public.tasks (user_id, id, list_id, title, someday_tier, base_updated_at)
values ('00000000-0000-4000-8000-00000000002a', 'd1', 'wish', 'マチュピチュに行く', 'dream', '-infinity');
select is((select someday_tier from public.tasks where id = 'd1'), 'dream', '夢の段を書ける');

-- 列を含まない書き込み（前の版のアプリ）は段に触れない
select set_config('test.v1', (select updated_at::text from public.tasks where id = 'd1'), true);
insert into public.tasks (user_id, id, list_id, title, base_updated_at)
values ('00000000-0000-4000-8000-00000000002a', 'd1', 'wish', 'マチュピチュに行く（2027 年）', current_setting('test.v1')::timestamptz)
on conflict (user_id, id) do update set title = excluded.title, base_updated_at = excluded.base_updated_at;
select is((select someday_tier from public.tasks where id = 'd1'), 'dream', '前の版の書き込みでも段は残る');

-- 'dream' のほかは入れられない。null（やりたい）には戻せる
select throws_ok(
  $$update public.tasks set someday_tier = 'wish', base_updated_at = updated_at where id = 'd1'$$,
  '23514', null, '段は dream か null');
update public.tasks set someday_tier = null, base_updated_at = updated_at where id = 'd1';
select is((select someday_tier from public.tasks where id = 'd1'), null, 'やりたいに戻せる');
reset role;

select * from finish();
rollback;
