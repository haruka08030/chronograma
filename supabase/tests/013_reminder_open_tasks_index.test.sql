-- 026 の tasks_reminder_open_idx: 通知の送信が読む未完了のタスク（daily-reminders の openTasks と同じ条件）は、この部分索引で読む
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select has_index('public', 'tasks', 'tasks_reminder_open_idx', 'tasks に tasks_reminder_open_idx');
select is(
  (select indexdef ~ 'WHERE' from pg_indexes where schemaname = 'public' and indexname = 'tasks_reminder_open_idx'),
  true,
  'tasks_reminder_open_idx は部分索引'
);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000a', 'remind-a@example.test');
insert into public.lists (user_id, id, name) values ('00000000-0000-4000-8000-00000000000a', 'inbox', 'Inbox');
-- 完了・記録・日付の無い行がたくさんあり、通知に使う行は少ない（ふつうの使い方）
insert into public.tasks (user_id, id, list_id, completed, scheduled_date)
select '00000000-0000-4000-8000-00000000000a', 'done' || g, 'inbox', true, date '2026-10-01' from generate_series(1, 2000) g;
insert into public.tasks (user_id, id, list_id, is_time_log, scheduled_date)
select '00000000-0000-4000-8000-00000000000a', 'log' || g, 'inbox', true, date '2026-10-01' from generate_series(1, 2000) g;
insert into public.tasks (user_id, id, list_id, scheduled_date, due_date) values
  ('00000000-0000-4000-8000-00000000000a', 'open1', 'inbox', date '2026-10-08', null),
  ('00000000-0000-4000-8000-00000000000a', 'open2', 'inbox', null, date '2026-10-09'),
  ('00000000-0000-4000-8000-00000000000a', 'undated', 'inbox', null, null);
analyze public.tasks;

create function pg_temp.plan_of(q text) returns setof text language plpgsql as $$
begin
  return query execute 'explain (costs off) ' || q;
end
$$;

select ok(
  exists (
    select 1 from pg_temp.plan_of($q$
      select id, title, list_id from public.tasks
      where user_id = '00000000-0000-4000-8000-00000000000a'
        and completed is false and is_time_log is false and parent_id is null
        and deleted_at is null and archived_at is null
        and (scheduled_date is not null or due_date is not null)
        and id > 'a'
      order by id limit 1000
    $q$) line where line ~ 'tasks_reminder_open_idx'
  ),
  '通知の未完了のタスクの読み込みは tasks_reminder_open_idx を使う'
);

select results_eq(
  $q$
    select id from public.tasks
    where user_id = '00000000-0000-4000-8000-00000000000a'
      and completed is false and is_time_log is false and parent_id is null
      and deleted_at is null and archived_at is null
      and (scheduled_date is not null or due_date is not null)
    order by id
  $q$,
  $$values ('open1'::text), ('open2'::text)$$,
  '読めるのは未完了で日付のある行だけ'
);

select * from finish();
rollback;
