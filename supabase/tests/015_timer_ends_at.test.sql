-- 028 の user_active_timer.ends_at（「あと何分」、#290）: 終わりの時刻は全部の購読に写り、前の版のアプリが
-- 別のタイマーを始めた・止めたときには前のタイマーの終わりが残らない
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_column('public', 'user_active_timer', 'ends_at', 'user_active_timer に ends_at');
select has_column('public', 'push_subscriptions', 'timer_ends_at', 'push_subscriptions に timer_ends_at');
select has_column('public', 'push_subscriptions', 'timer_end_notified_for', 'push_subscriptions に timer_end_notified_for');
select has_trigger('public', 'user_active_timer', 'user_active_timer_clear_ends_at', 'user_active_timer に user_active_timer_clear_ends_at');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000a', 'focus-a@example.test');
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values
  ('https://fcm.googleapis.com/fcm/send/pc', '00000000-0000-4000-8000-00000000000a', 'k', 'a'),
  ('https://web.push.apple.com/phone', '00000000-0000-4000-8000-00000000000a', 'k', 'a');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

-- この版のアプリが 25 分の終わりを付けて始める
insert into public.user_active_timer (user_id, started_at, task_title, ends_at, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', '2026-10-08T09:00:00Z', 'レポート', '2026-10-08T09:25:00Z', '-infinity');
select is(
  (select count(*)::int from public.push_subscriptions where timer_ends_at = '2026-10-08T09:25:00Z'), 2,
  '終わりの時刻は全部の購読に写る');

-- 同じタイマーで終わりを選び直す
select set_config('test.v1', (select updated_at::text from public.user_active_timer), true);
update public.user_active_timer set ends_at = '2026-10-08T09:50:00Z', base_updated_at = current_setting('test.v1')::timestamptz;
select is(
  (select count(*)::int from public.push_subscriptions where timer_ends_at = '2026-10-08T09:50:00Z'), 2,
  '選び直した終わりも写る');

-- 前の版のアプリが別のタイマーを始める（ends_at を送らない upsert）
select set_config('test.v2', (select updated_at::text from public.user_active_timer), true);
insert into public.user_active_timer (user_id, started_at, task_title, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', '2026-10-08T10:00:00Z', '英語', current_setting('test.v2')::timestamptz)
on conflict (user_id) do update set started_at = excluded.started_at, task_title = excluded.task_title,
  base_updated_at = excluded.base_updated_at;
select is((select ends_at from public.user_active_timer), null, '前の版で別のタイマーを始めたら前の終わりは消える');
select is(
  (select count(*)::int from public.push_subscriptions where timer_ends_at is null and timer_title = '英語'), 2,
  '購読の終わりも消える');

-- 終わりを付け直してから、前の版のアプリが止める（started_at だけ null にする）
select set_config('test.v3', (select updated_at::text from public.user_active_timer), true);
update public.user_active_timer set ends_at = '2026-10-08T11:30:00Z', base_updated_at = current_setting('test.v3')::timestamptz;
select set_config('test.v4', (select updated_at::text from public.user_active_timer), true);
update public.user_active_timer set started_at = null, task_title = null, tags = '[]', base_updated_at = current_setting('test.v4')::timestamptz;
select is((select ends_at from public.user_active_timer), null, '止めたら終わりも消える');

-- 終わりは始めた時刻より後で 1 日以内
select throws_ok(
  $$update public.user_active_timer set started_at = '2026-10-08T12:00:00Z', task_title = 'x', ends_at = '2026-10-08T11:00:00Z', base_updated_at = updated_at$$,
  '23514', null, '始めた時刻より前の終わりは入れられない');
select throws_ok(
  $$update public.user_active_timer set started_at = '2026-10-08T12:00:00Z', task_title = 'x', ends_at = '2026-10-10T12:00:00Z', base_updated_at = updated_at$$,
  '23514', null, '1 日より先の終わりは入れられない');

-- タブを開いていた端末が先に知らせた印は、端末から本人の購読に書ける
update public.push_subscriptions set timer_end_notified_for = '2026-10-08T09:50:00Z';
select is(
  (select count(*)::int from public.push_subscriptions where timer_end_notified_for = '2026-10-08T09:50:00Z'), 2,
  '時間の通知の印を本人の購読に書ける');
reset role;

select * from finish();
rollback;
