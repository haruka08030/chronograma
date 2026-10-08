-- 019 の user_active_timer: 動いているタイマーは利用者ごとに 1 行。版が合うときだけ書け（settings_write_guard）、
-- 止め忘れの通知の列（push_subscriptions.timer_started_at / timer_title）はその人の全部の購読に写る
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_table('public', 'user_active_timer', 'user_active_timer がある');
select has_trigger('public', 'user_active_timer', 'settings_write_guard', 'user_active_timer に settings_write_guard');
select has_trigger('public', 'user_active_timer', 'copy_active_timer_to_push', 'user_active_timer に copy_active_timer_to_push');
select has_trigger('public', 'push_subscriptions', 'push_subscription_shared_timer', 'push_subscriptions に push_subscription_shared_timer');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'timer-a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'timer-b@example.test');
-- A の 2 台の購読（PC とスマホ）。どちらも止め忘れの列は空
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values
  ('https://fcm.googleapis.com/fcm/send/pc', '00000000-0000-4000-8000-00000000000a', 'k', 'a'),
  ('https://web.push.apple.com/phone', '00000000-0000-4000-8000-00000000000a', 'k', 'a');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

-- PC で始める（行が無いはず = -infinity）
insert into public.user_active_timer (user_id, started_at, task_title, tags, updated_at, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', '2026-10-03T09:00:00Z', 'ES', '["就活"]', '1999-01-01T00:00:00Z', '-infinity')
on conflict (user_id) do update set started_at = excluded.started_at, task_title = excluded.task_title,
  tags = excluded.tags, base_updated_at = excluded.base_updated_at;
select is((select updated_at from public.user_active_timer), now(), '新しい行の updated_at はサーバーの時刻');
select is(
  (select count(*)::int from public.push_subscriptions where timer_started_at = '2026-10-03T09:00:00Z' and timer_title = 'ES'), 2,
  '始めたタイマーは A の全部の購読に写る');

-- スマホが同じ時に「行が無いはず」で始めても、先に入った行を上書きしない
insert into public.user_active_timer (user_id, started_at, task_title, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', '2026-10-03T09:05:00Z', 'other', '-infinity')
on conflict (user_id) do update set started_at = excluded.started_at, task_title = excluded.task_title,
  base_updated_at = excluded.base_updated_at;
select is((select task_title from public.user_active_timer), 'ES', '行があるのに -infinity をもとにした書き込みは捨てる');

-- スマホで止める（取得した版をもとに null にする）
select set_config('test.v1', (select updated_at::text from public.user_active_timer), true);
update public.user_active_timer set started_at = null, task_title = null, tags = '[]',
  base_updated_at = current_setting('test.v1')::timestamptz;
select is((select started_at from public.user_active_timer), null, '版が合う書き込みで止められる');
select is(
  (select count(*)::int from public.push_subscriptions where timer_started_at is null and timer_title is null), 2,
  '止めたら A の全部の購読から止め忘れの列が消える');

-- 止める前の版をもとにした書き込み（もう止まっているのに古い画面から始め直す）は捨てる
update public.user_active_timer set started_at = '2026-10-03T09:30:00Z', task_title = 'stale',
  base_updated_at = current_setting('test.v1')::timestamptz;
select is((select started_at from public.user_active_timer), null, '古い版をもとにした書き込みは捨てる');

-- 端末が自分の古い値で購読を書いても、共有のタイマーの値になる
update public.push_subscriptions set timer_started_at = '2026-10-03T08:00:00Z', timer_title = 'old local'
 where endpoint = 'https://fcm.googleapis.com/fcm/send/pc';
select is(
  (select timer_title from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/pc'), null,
  '購読の止め忘れの列は共有のタイマーの値にそろう');

-- 版なしの書き込み（下限より古い版のアプリ）は断る（017）
select throws_ok(
  $$update public.user_active_timer set started_at = '2026-10-03T10:00:00Z', task_title = 'x', updated_at = '2999-01-01T00:00:00Z'$$,
  'P0001', null, '版なしの書き込みは断る');
-- 題名の無い動いているタイマーは入れられない
select throws_ok(
  $$update public.user_active_timer set started_at = '2026-10-03T10:00:00Z', base_updated_at = updated_at$$,
  '23514', null, '動いているなら題名がいる');
reset role;

-- B からは A のタイマーが見えない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.user_active_timer), 0, 'ほかの人のタイマーは読めない');
reset role;

select * from finish();
rollback;
