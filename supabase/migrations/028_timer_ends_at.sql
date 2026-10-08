-- 動いているタイマーの「あと何分」（集中タイマー、#290）。終わりの時刻を端末間で同じにし、時間になったら Web Push で知らせる。
-- - user_active_timer.ends_at: 終わりの時刻。null = 終わりなし（今までどおり数え上げ）。時間になっても記録は止めない
-- - 列を知らない前の版のアプリは ends_at を送らない。前の版で別のタイマーを始めた・止めたときに前のタイマーの終わりが
--   残らないよう、始めた時刻が変わって ends_at がそのまま（送られていない）なら、トリガーで null にする
-- - push_subscriptions.timer_ends_at は 019 の止め忘れの列と同じく user_active_timer の写し。
--   timer_end_notified_for は時間の通知を送った終わりの時刻（Edge Function daily-reminders が書く。タブを開いていた端末が先に知らせたときは端末が書く）
-- 既にある行の値は変えない。何度流しても同じ形になる。

alter table public.user_active_timer add column if not exists ends_at timestamptz;

-- 終わりは動いているタイマーにだけ、始めた時刻より後、1 日以内
alter table public.user_active_timer drop constraint if exists user_active_timer_ends_at_check;
alter table public.user_active_timer add constraint user_active_timer_ends_at_check check (
  ends_at is null or (started_at is not null and ends_at > started_at and ends_at <= started_at + interval '1 day')
);

create or replace function public.user_active_timer_clear_ends_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.started_at is null then
    new.ends_at := null;
  elsif tg_op = 'UPDATE' and new.started_at is distinct from old.started_at and new.ends_at is not distinct from old.ends_at then
    new.ends_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists user_active_timer_clear_ends_at on public.user_active_timer;
create trigger user_active_timer_clear_ends_at before insert or update on public.user_active_timer
  for each row execute function public.user_active_timer_clear_ends_at();

alter table public.push_subscriptions add column if not exists timer_ends_at timestamptz;
alter table public.push_subscriptions add column if not exists timer_end_notified_for timestamptz;

-- 019 の写しに終わりの時刻を足す（動きはそのまま）
create or replace function public.copy_active_timer_to_push()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.push_subscriptions
     set timer_started_at = new.started_at,
         timer_title = new.task_title,
         timer_ends_at = new.ends_at
   where user_id = new.user_id
     and (timer_started_at is distinct from new.started_at
          or timer_title is distinct from new.task_title
          or timer_ends_at is distinct from new.ends_at);
  return null;
end;
$$;

create or replace function public.push_subscription_shared_timer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t record;
begin
  select started_at, task_title, ends_at into t from public.user_active_timer where user_id = new.user_id;
  if found then
    new.timer_started_at := t.started_at;
    new.timer_title := t.task_title;
    new.timer_ends_at := t.ends_at;
  end if;
  return new;
end;
$$;
