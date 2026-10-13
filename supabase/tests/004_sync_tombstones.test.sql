-- 008 の消えた行の印（record_sync_tombstones）と、010 の上限（trim_sync_tombstones）
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'tomb-a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'tomb-b@example.test');
insert into public.lists (user_id, id, name) values ('00000000-0000-4000-8000-00000000000a', 'l1', 'A list');
insert into public.tasks (user_id, id, list_id) select '00000000-0000-4000-8000-00000000000a', 't' || g, 'l1' from generate_series(1, 6) g;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

-- 008: 消すと印が残り、同じ id がまた入ると消える
delete from public.tasks where id = 't1';
select results_eq(
  $$select table_name, row_id, deleted_at from public.sync_tombstones$$,
  $$values ('tasks'::text, 't1'::text, now())$$,
  '行を消すと印が残る（本人には見える）');
insert into public.tasks (user_id, id, list_id, base_updated_at) values ('00000000-0000-4000-8000-00000000000a', 't1', 'l1', '-infinity');
select is_empty($$select 1 from public.sync_tombstones where row_id = 't1'$$, '同じ id の行がまた入ると印は消える');

-- 端末からは書けない（書くのはトリガーだけ）
select throws_ok(
  $$insert into public.sync_tombstones (user_id, table_name, row_id) values ('00000000-0000-4000-8000-00000000000a', 'tasks', 'x')$$,
  '42501', null, 'sync_tombstones に入れられない');
delete from public.tasks where id = 't2';
select throws_ok($$update public.sync_tombstones set deleted_at = now()$$, '42501', null, 'sync_tombstones を変えられない');
select throws_ok($$delete from public.sync_tombstones$$, '42501', null, 'sync_tombstones を消せない');
select throws_ok(
  $$insert into public.sync_tombstone_purges (user_id, last_deleted_at) values ('00000000-0000-4000-8000-00000000000a', now())$$,
  '42501', null, 'sync_tombstone_purges に入れられない');
reset role;

-- 010: 上限の引数は 50,000
select ok(
  (select pg_get_triggerdef(oid) from pg_trigger where tgname = 'trim_sync_tombstones' and tgrelid = 'public.sync_tombstones'::regclass)
    like '%trim_sync_tombstones(''50000'')%',
  '印の上限は 1 人 50,000 件');

-- 上限を 3 にして動きを確かめる（このトランザクションの中だけ）
drop trigger trim_sync_tombstones on public.sync_tombstones;
create trigger trim_sync_tombstones after insert on public.sync_tombstones
  referencing new table as new_rows for each statement execute function public.trim_sync_tombstones('3');
-- 時刻の違う印を 3 つ（t2 は上で消した分）
delete from public.tasks where user_id = '00000000-0000-4000-8000-00000000000a' and id in ('t3', 't4');
update public.sync_tombstones set deleted_at = now() - interval '3 hours' where row_id = 't2';
update public.sync_tombstones set deleted_at = now() - interval '2 hours' where row_id = 't3';
update public.sync_tombstones set deleted_at = now() - interval '1 hour' where row_id = 't4';
-- B にも印を 1 つ（A の上限で消えないこと）
insert into public.lists (user_id, id, name) values ('00000000-0000-4000-8000-00000000000b', 'l1', 'B list');
insert into public.tasks (user_id, id, list_id) values ('00000000-0000-4000-8000-00000000000b', 'b1', 'l1');
delete from public.tasks where user_id = '00000000-0000-4000-8000-00000000000b';
update public.sync_tombstones set deleted_at = now() - interval '10 days' where user_id = '00000000-0000-4000-8000-00000000000b';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select is_empty($$select 1 from public.sync_tombstone_purges$$, '上限までは何も消さない');
select lives_ok($$delete from public.tasks where id = 't5'$$, '上限を超えても削除は断らない');
select results_eq(
  $$select row_id from public.sync_tombstones order by row_id$$,
  $$values ('t3'::text), ('t4'), ('t5')$$,
  '上限を超えたら一番古い印から消す');
select is(
  (select last_deleted_at from public.sync_tombstone_purges), now() - interval '3 hours',
  '消した印の時刻を残す（本人には見える）');
select lives_ok($$delete from public.tasks where id = 't6'$$, 'もう一度超えても削除は断らない');
select results_eq(
  $$select row_id from public.sync_tombstones order by row_id$$,
  $$values ('t4'::text), ('t5'), ('t6')$$,
  '次に古い印を消す');
select is(
  (select last_deleted_at from public.sync_tombstone_purges), now() - interval '2 hours',
  '消した印の時刻は新しいほうへ進む');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select is_empty($$select 1 from public.sync_tombstone_purges$$, 'B は A の sync_tombstone_purges を読めない');
select is((select count(*) from public.sync_tombstones), 1::bigint, 'A の上限で B の印は消えない');
reset role;

-- 30 日より古い印を消すジョブの中身（pg_cron が無い DB でも同じ文を確かめる）
update public.sync_tombstones set deleted_at = now() - interval '31 days' where row_id = 't4';
delete from public.sync_tombstones where deleted_at < now() - interval '30 days';
select results_eq(
  $$select row_id from public.sync_tombstones where user_id = '00000000-0000-4000-8000-00000000000a' order by row_id$$,
  $$values ('t5'::text), ('t6')$$,
  '30 日より古い印は消え、新しい印は残る');

-- アカウントの削除（cascade）では印も上限の記録も残さない
delete from auth.users where id = '00000000-0000-4000-8000-00000000000a';
select is_empty(
  $$select 1 from public.sync_tombstones where user_id = '00000000-0000-4000-8000-00000000000a'$$,
  'アカウントを消すと印も消える');
select is_empty(
  $$select 1 from public.sync_tombstone_purges where user_id = '00000000-0000-4000-8000-00000000000a'$$,
  'アカウントを消すと上限の記録も消える');
select is(
  (select count(*) from public.sync_tombstones where user_id = '00000000-0000-4000-8000-00000000000b'), 1::bigint,
  '他の人の印は残る');

select * from finish();
rollback;
