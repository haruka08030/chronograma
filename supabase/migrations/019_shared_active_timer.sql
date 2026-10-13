-- 動いているタイマーを端末間で 1 つにする（#301）。PC で始めたタイマーをスマホで止められ、止めると記録が 1 本だけできる。
-- - user_active_timer: 利用者ごとに 1 行。started_at が null なら何も動いていない（止めたら行は消さずに null にする。
--   消すと版が無くなり、止めたことと「まだ一度も送っていない」の区別がつかない）
-- - 書き込みは 007 / 017 の settings_write_guard で確かめる（base_updated_at の版が合うときだけ通し、updated_at はサーバーの時刻）
-- - 止め忘れの通知（push_subscriptions.timer_started_at / timer_title、Edge Function daily-reminders）は、
--   この行をその人の全部の購読に写す。購読を書くときもこの行があればこの行の値にする（端末ごとの古い値で上書きしない）
-- 既にある行の値は変えない。何度流しても同じ形になる。

create table if not exists public.user_active_timer (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  -- 始めた時刻。null = 何も動いていない
  started_at       timestamptz,
  task_title       text,
  -- 記録に付けるラベル（名前の並び）
  tags             jsonb not null default '[]'::jsonb,
  -- 元の To-Do・予定の id（null は元なし）と、元の名前の無い色
  task_id          text,
  color            text,
  updated_at       timestamptz not null default now(),
  base_updated_at  timestamptz
);

alter table public.user_active_timer enable row level security;

drop policy if exists user_active_timer_select_own on public.user_active_timer;
create policy user_active_timer_select_own on public.user_active_timer for select using (auth.uid() = user_id);
drop policy if exists user_active_timer_insert_own on public.user_active_timer;
create policy user_active_timer_insert_own on public.user_active_timer for insert with check (auth.uid() = user_id);
drop policy if exists user_active_timer_update_own on public.user_active_timer;
create policy user_active_timer_update_own on public.user_active_timer for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists user_active_timer_delete_own on public.user_active_timer;
create policy user_active_timer_delete_own on public.user_active_timer for delete using (auth.uid() = user_id);

-- 大きさの上限（tasks の題名・ラベルと同じ）。動いているなら題名がある、止まっているなら題名も無い
alter table public.user_active_timer drop constraint if exists user_active_timer_size_check;
alter table public.user_active_timer add constraint user_active_timer_size_check check (
  coalesce(length(task_title), 0) <= 2000
  and pg_column_size(tags) <= 65536
  and coalesce(length(task_id), 0) <= 200
  and coalesce(length(color), 0) <= 100
  and (started_at is null) = (task_title is null)
);

-- 版の確かめ（007 / 017 の settings_write_guard。行は user_id だけで決まる）
drop trigger if exists settings_write_guard on public.user_active_timer;
create trigger settings_write_guard before insert or update on public.user_active_timer
  for each row execute function public.settings_write_guard();

-- 止め忘れの通知: タイマーが替わったら、その人の全部の購読に写す（購読は端末ごとの行。閉じたノート PC の購読だけに載っていた）
create or replace function public.copy_active_timer_to_push()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.push_subscriptions
     set timer_started_at = new.started_at,
         timer_title = new.task_title
   where user_id = new.user_id
     and (timer_started_at is distinct from new.started_at or timer_title is distinct from new.task_title);
  return null;
end;
$$;

drop trigger if exists copy_active_timer_to_push on public.user_active_timer;
create trigger copy_active_timer_to_push after insert or update on public.user_active_timer
  for each row execute function public.copy_active_timer_to_push();

-- 購読を書くとき（端末の購読の更新・送った印の更新）も、共有のタイマーの行があればその値にする。
-- 行が無い利用者（まだこの版のアプリで同期していない）は、端末が送った値のまま（前と同じ）
create or replace function public.push_subscription_shared_timer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t record;
begin
  select started_at, task_title into t from public.user_active_timer where user_id = new.user_id;
  if found then
    new.timer_started_at := t.started_at;
    new.timer_title := t.task_title;
  end if;
  return new;
end;
$$;

drop trigger if exists push_subscription_shared_timer on public.push_subscriptions;
create trigger push_subscription_shared_timer before insert or update on public.push_subscriptions
  for each row execute function public.push_subscription_shared_timer();

