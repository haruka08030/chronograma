-- 006 の行数の上限（enforce_row_limit）: 超える文は row_limit_exceeded で断る。既にある行の更新（upsert）は止めない
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select has_trigger('public', t, 'enforce_row_limit', t || ' に enforce_row_limit')
from unnest(array['lists', 'habits']) t;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000a', 'limit-a@example.test');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$insert into public.lists (user_id, id, name, base_updated_at) select '00000000-0000-4000-8000-00000000000a', 'l' || g, 'x', '-infinity' from generate_series(1, 1001) g$$,
  'P0001', 'row_limit_exceeded', '上限（lists 1,000）を超える文は断る');
select lives_ok(
  $$insert into public.lists (user_id, id, name, base_updated_at) select '00000000-0000-4000-8000-00000000000a', 'l' || g, 'x', '-infinity' from generate_series(1, 1000) g$$,
  '上限ちょうどまでは入る');
select throws_ok(
  $$insert into public.lists (user_id, id, name, base_updated_at) values ('00000000-0000-4000-8000-00000000000a', 'one-more', 'x', '-infinity')$$,
  'P0001', 'row_limit_exceeded', '上限に達したら 1 行も足せない');
select lives_ok(
  $$insert into public.lists (user_id, id, name, base_updated_at)
    values ('00000000-0000-4000-8000-00000000000a', 'l1', 'renamed', (select updated_at from public.lists where id = 'l1'))
    on conflict (user_id, id) do update set name = excluded.name, base_updated_at = excluded.base_updated_at$$,
  '上限に達していても既にある行の更新（upsert）は通る');
reset role;

select * from finish();
rollback;
