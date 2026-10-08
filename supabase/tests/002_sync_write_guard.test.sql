-- 004 の sync_write_guard: 端末が送った版（base_updated_at）がサーバーの updated_at と同じときだけ書き、updated_at はサーバーの時刻にする
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select has_trigger('public', t, 'sync_write_guard', t || ' に sync_write_guard')
from unnest(array['lists', 'list_sections', 'tasks', 'habits']) t;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000a', 'guard-a@example.test');
insert into public.lists (user_id, id, name, updated_at) values ('00000000-0000-4000-8000-00000000000a', 'l1', 'v0', '2020-01-01T00:00:00Z');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

-- 版が合う更新は通り、updated_at はサーバーの時刻（端末が送った値ではない）
update public.lists set name = 'v1', updated_at = '1999-01-01T00:00:00Z', base_updated_at = '2020-01-01T00:00:00Z' where id = 'l1';
select is((select name from public.lists where id = 'l1'), 'v1', '版が合う更新は通る');
select is((select updated_at from public.lists where id = 'l1'), now(), 'updated_at はサーバーの時刻');
select is((select base_updated_at from public.lists where id = 'l1'), null, 'base_updated_at は行に残さない');

-- 古い版をもとにした更新は捨てる（エラーにせず 0 行）
update public.lists set name = 'stale', base_updated_at = '2020-01-01T00:00:00Z' where id = 'l1';
select is((select name from public.lists where id = 'l1'), 'v1', '古い版をもとにした更新は捨てる');

-- upsert（端末の送り方）: 版が合えば通り、updated_at は前の値より必ず新しい
insert into public.lists (user_id, id, name, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', 'l1', 'v2', now())
on conflict (user_id, id) do update set name = excluded.name, base_updated_at = excluded.base_updated_at;
select is((select name from public.lists where id = 'l1'), 'v2', 'upsert も版が合えば通る');
select is((select updated_at from public.lists where id = 'l1'), now() + interval '1 microsecond', 'updated_at は前の値より新しい');

insert into public.lists (user_id, id, name, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', 'l1', 'stale', now())
on conflict (user_id, id) do update set name = excluded.name, base_updated_at = excluded.base_updated_at;
select is((select name from public.lists where id = 'l1'), 'v2', 'upsert も古い版なら捨てる');

-- 新しい行（版は -infinity）: updated_at はサーバーの時刻
insert into public.lists (user_id, id, name, updated_at, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', 'l2', 'new', '1999-01-01T00:00:00Z', '-infinity');
select is((select updated_at from public.lists where id = 'l2'), now(), '新しい行の updated_at はサーバーの時刻');

-- 版を送らない書き込み（下限より古い版のアプリ）は断る（017）
select throws_ok(
  $$update public.lists set name = 'legacy', updated_at = '2999-01-01T00:00:00Z' where id = 'l2'$$,
  'P0001', null, '版なしの更新は断る');
select throws_ok(
  $$insert into public.lists (user_id, id, name) values ('00000000-0000-4000-8000-00000000000a', 'l3', 'legacy')$$,
  'P0001', null, '版なしの新しい行は断る');

-- 外部キーの動作（セクションを消すと中のタスクの section_id が null）は通り、updated_at をサーバーの時刻にする
reset role;
insert into public.list_sections (user_id, id, list_id, name, updated_at)
values ('00000000-0000-4000-8000-00000000000a', 's1', 'l1', 'sec', '2020-01-01T00:00:00Z');
insert into public.tasks (user_id, id, list_id, section_id, title, updated_at)
values ('00000000-0000-4000-8000-00000000000a', 't1', 'l1', 's1', 'in section', '2020-01-01T00:00:00Z');
set local role authenticated;
delete from public.list_sections where id = 's1';
select is((select section_id from public.tasks where id = 't1'), null, '外部キーの動作の更新は通る');
select is((select updated_at from public.tasks where id = 't1'), now(), '外部キーの動作で変わった行の updated_at はサーバーの時刻');
reset role;

select * from finish();
rollback;
