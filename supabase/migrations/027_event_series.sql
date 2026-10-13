-- 毎週の予定（授業など）と時間割の設定（#279）。
--
-- tasks.event_series: 毎週繰り返す予定の 1 回分に付ける印。
--   { "id": "…", "weekdays": [1, 3], "until": "2026-07-31", "skipHolidays": false }
--   （id は同じ繰り返しの回どうしで同じ文字列、weekdays は 1=月 … 7=日、until は終わりの日、skipHolidays は祝日に入れなかったか）
-- - 回は前もって終わりの日までの分を、ふつうの予定の行（is_event）として作る。カレンダー・今日の計画・空き時間・
--   通知（daily-reminders）・前の版のアプリは、この列を読まなくても 1 回ずつの予定として扱える
-- - 1 回だけの変更・休講はその回の行を直す・消す（Google カレンダーの「この予定のみ」）。「以降すべて」は同じ id で日付が後の行をまとめて直す
-- - null は繰り返さない予定。To-Do・記録では使わない
-- - 列を含まない古いアプリの upsert は列に触れないので、印は消えない。既存の行は null
--
-- user_timetable: 時間割の設定（利用者ごとに 1 行）。
--   timetable = { "periods": [{ "start": "09:00", "end": "10:30" }, …], "termStart": "2026-04-06" | null,
--                 "termEnd": "2026-07-31" | null, "skipHolidays": false }
-- - 時限（学校ごとに違うので編集できる）と学期の期間。時間割のマスから授業を入れると、この期間の毎週の予定（上の印）ができる
-- - 書き込みは 007 / 017 の settings_write_guard で確かめる（base_updated_at の版が合うときだけ通し、updated_at はサーバーの時刻）
--
-- 既にある行の値は変えない。何度流しても同じ形になる。

alter table public.tasks add column if not exists event_series jsonb;

-- 形と大きさ（id のある object。アプリでは 1 回分に百バイトほど）
alter table public.tasks drop constraint if exists tasks_event_series_check;
alter table public.tasks add constraint tasks_event_series_check
  check (
    event_series is null
    or (jsonb_typeof(event_series) = 'object'
        and jsonb_typeof(event_series -> 'id') = 'string'
        and octet_length(event_series::text) <= 2048)
  );

create table if not exists public.user_timetable (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  timetable        jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now(),
  base_updated_at  timestamptz
);

alter table public.user_timetable enable row level security;

drop policy if exists user_timetable_select_own on public.user_timetable;
create policy user_timetable_select_own on public.user_timetable for select using (auth.uid() = user_id);
drop policy if exists user_timetable_insert_own on public.user_timetable;
create policy user_timetable_insert_own on public.user_timetable for insert with check (auth.uid() = user_id);
drop policy if exists user_timetable_update_own on public.user_timetable;
create policy user_timetable_update_own on public.user_timetable for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists user_timetable_delete_own on public.user_timetable;
create policy user_timetable_delete_own on public.user_timetable for delete using (auth.uid() = user_id);

-- 大きさの上限（アプリでは時限 12 個まで。それより十分大きく取る）。object であること
alter table public.user_timetable drop constraint if exists user_timetable_size_check;
alter table public.user_timetable add constraint user_timetable_size_check
  check (jsonb_typeof(timetable) = 'object' and octet_length(timetable::text) <= 16384);

-- 版の確かめ（007 / 017 の settings_write_guard。行は user_id だけで決まる）
drop trigger if exists settings_write_guard on public.user_timetable;
create trigger settings_write_guard before insert or update on public.user_timetable
  for each row execute function public.settings_write_guard();
