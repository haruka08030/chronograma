-- 1 日の気分とひとこと（今日の計画の「1 日を締める」で 5 つの記号から 1 つ押し、任意で一言、#324）を端末間で同期する。
-- - day_moods: 利用者ごと・日ごとに 1 行（主キー (user_id, day)）。day はその人の暦の日付（アプリのタイムゾーンの日）
-- - mood: 1（とても悪い）〜 5（とても良い）。null は選んでいない（押した記号を外した。行は消さずに残す）
-- - note: ひとこと（空でもよい）
-- - 行は消さない（記号を外す・一言を消すのは null / '' にする更新）。消えた行の印（008）は要らない
-- - 書き込みの確かめは 004 / 017 の sync_write_guard と同じ考え方（base_updated_at の版が合うときだけ通し、updated_at はサーバーの時刻。
--   版なしの書き込みは断る）。行が (user_id, day) で決まるので別の関数にする
-- - 睡眠・記録（tasks）と日付で突き合わせて読む（#326）。統計・週のふりかえりの数にはまだ入れない
-- 既にある行の値は変えない。何度流しても同じ形になる。

create table if not exists public.day_moods (
  user_id          uuid not null references auth.users (id) on delete cascade,
  day              date not null,
  mood             smallint,
  note             text not null default '',
  updated_at       timestamptz not null default now(),
  base_updated_at  timestamptz,
  primary key (user_id, day)
);

alter table public.day_moods enable row level security;

drop policy if exists day_moods_select_own on public.day_moods;
create policy day_moods_select_own on public.day_moods for select using (auth.uid() = user_id);
drop policy if exists day_moods_insert_own on public.day_moods;
create policy day_moods_insert_own on public.day_moods for insert with check (auth.uid() = user_id);
drop policy if exists day_moods_update_own on public.day_moods;
create policy day_moods_update_own on public.day_moods for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists day_moods_delete_own on public.day_moods;
create policy day_moods_delete_own on public.day_moods for delete using (auth.uid() = user_id);

-- 値の範囲。気分は 1〜5 か null、ひとことはアプリでは 140 字まで（それより十分大きく取る）、日付は使う範囲だけ
alter table public.day_moods drop constraint if exists day_moods_mood_check;
alter table public.day_moods add constraint day_moods_mood_check check (mood is null or mood between 1 and 5);
alter table public.day_moods drop constraint if exists day_moods_note_check;
alter table public.day_moods add constraint day_moods_note_check check (char_length(note) <= 500);
alter table public.day_moods drop constraint if exists day_moods_day_check;
alter table public.day_moods add constraint day_moods_day_check check (day between date '2000-01-01' and date '2100-12-31');

-- 差分の取得（前回の取得より後に変わった行だけ）のための索引（009 と同じ）
create index if not exists day_moods_user_updated_idx on public.day_moods (user_id, updated_at);

-- 版の確かめ。017 の sync_write_guard と同じで、行を (user_id, day) で探す
create or replace function public.day_mood_write_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  existing boolean;
begin
  if tg_op = 'INSERT' then
    if new.base_updated_at is null then
      -- アプリ（anon / authenticated）からの版を送らない書き込みは断る。管理の書き込み（service_role・migration）は通す
      if current_user in ('anon', 'authenticated') then
        raise exception 'app_outdated: base_updated_at is required' using errcode = 'P0001';
      end if;
      return new;
    end if;
    -- upsert で行があるときは、この後の更新側で確かめる。ここで base_updated_at を消すと更新側（excluded）に届かない
    select exists (select 1 from public.day_moods where user_id = new.user_id and day = new.day) into existing;
    if existing then
      return new;
    end if;
    new.updated_at := now();
    new.base_updated_at := null;
    return new;
  end if;
  -- UPDATE
  if new.base_updated_at is null or (old.base_updated_at is not null and new.base_updated_at = old.base_updated_at) then
    new.base_updated_at := null;
    if current_user in ('anon', 'authenticated') then
      raise exception 'app_outdated: base_updated_at is required' using errcode = 'P0001';
    end if;
    if new.updated_at < old.updated_at then
      return null;
    end if;
    return new;
  end if;
  if new.base_updated_at is distinct from old.updated_at then
    -- 取得した後に他の端末が変えた行。次の同期で取り直して合わせる
    return null;
  end if;
  new.updated_at := greatest(now(), old.updated_at + interval '1 microsecond');
  new.base_updated_at := null;
  return new;
end;
$$;

drop trigger if exists day_mood_write_guard on public.day_moods;
create trigger day_mood_write_guard before insert or update on public.day_moods
  for each row execute function public.day_mood_write_guard();

-- 1 人が持てる行数の上限（006 の enforce_row_limit）。1 日 1 行なので 100 年でも 36,500 行
drop trigger if exists enforce_row_limit on public.day_moods;
create trigger enforce_row_limit after insert on public.day_moods
  referencing new table as new_rows for each statement execute function public.enforce_row_limit('40000');
