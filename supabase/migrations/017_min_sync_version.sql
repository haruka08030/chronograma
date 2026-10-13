-- 版の下限: 古い版のアプリが端末の時計で書き勝たないようにする（#259）。
-- - 同期の取り決めの版の下限 `app_config.min_sync_version`（整数）。アプリは同期の最初に読み、自分の版
--   （`src/lib/syncVersion.ts` の SYNC_PROTOCOL_VERSION）より大きければ送らずに「新しい版を読み込む」を出す。
--   下限を上げるときはこの行を update する（migration は要らない）
-- - 版（base_updated_at）を送らない書き込みは断る（004・007 の「前の版のアプリは端末の時刻で比べる」道を閉じる）。
--   ただし外部キーの動作（tasks.section_id の on delete set null など）が起こした更新は通し、updated_at をサーバーの時刻にする
-- 何度流しても同じ形になる。

create table if not exists public.app_config (
  key text primary key,
  value jsonb not null
);
alter table public.app_config enable row level security;
drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config for select to anon, authenticated using (true);
grant select on public.app_config to anon, authenticated;
insert into public.app_config (key, value) values ('min_sync_version', '1'::jsonb) on conflict (key) do nothing;

create or replace function public.sync_write_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  existing boolean;
begin
  if tg_op = 'INSERT' then
    if new.base_updated_at is null then
      -- アプリ（anon / authenticated）からの版を送らない書き込み（下限より古い版のアプリ）は断る。端末の時計で書き勝っていた。
      -- 管理の書き込み（service_role・migration）は前と同じく通す
      if current_user in ('anon', 'authenticated') then
        raise exception 'app_outdated: base_updated_at is required' using errcode = 'P0001';
      end if;
      return new;
    end if;
    -- upsert で行があるときは、この後の更新側で確かめる。ここで base_updated_at を消すと更新側（excluded）に届かない
    execute format('select exists (select 1 from %I.%I where user_id = $1 and id = $2)', tg_table_schema, tg_table_name)
      into existing using new.user_id, new.id;
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
    -- 外部キーの動作（on delete set null など）が起こした更新は通し、updated_at をサーバーの時刻にする
    -- （端末の値のままだと差分の取得に出てこず、ほかの端末は消えた行を指したままだった）
    if pg_trigger_depth() > 1 then
      new.updated_at := greatest(now(), old.updated_at + interval '1 microsecond');
      return new;
    end if;
    -- アプリからの版を送らない書き込み（下限より古い版のアプリ）は断る
    if current_user in ('anon', 'authenticated') then
      raise exception 'app_outdated: base_updated_at is required' using errcode = 'P0001';
    end if;
    -- 管理の書き込み: 前と同じく端末の時刻で古ければ捨てる
    if new.updated_at < old.updated_at then
      return null;
    end if;
    return new;
  end if;
  if new.base_updated_at is distinct from old.updated_at then
    -- 取得した後に他の端末が変えた行。次の同期で新しい版と項目ごとに合わせ直す
    return null;
  end if;
  new.updated_at := greatest(now(), old.updated_at + interval '1 microsecond');
  new.base_updated_at := null;
  return new;
end;
$$;

create or replace function public.settings_write_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  existing boolean;
begin
  if tg_op = 'INSERT' then
    if new.base_updated_at is null then
      -- アプリ（anon / authenticated）からの版を送らない書き込み（下限より古い版のアプリ）は断る。端末の時計で書き勝っていた。
      -- 管理の書き込み（service_role・migration）は前と同じく通す
      if current_user in ('anon', 'authenticated') then
        raise exception 'app_outdated: base_updated_at is required' using errcode = 'P0001';
      end if;
      return new;
    end if;
    -- upsert で行があるときは、この後の更新側で確かめる。ここで base_updated_at を消すと更新側（excluded）に届かない
    execute format('select exists (select 1 from %I.%I where user_id = $1)', tg_table_schema, tg_table_name)
      into existing using new.user_id;
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
    -- アプリからの版を送らない書き込み（下限より古い版のアプリ）は断る
    if current_user in ('anon', 'authenticated') then
      raise exception 'app_outdated: base_updated_at is required' using errcode = 'P0001';
    end if;
    if new.updated_at < old.updated_at then
      return null;
    end if;
    return new;
  end if;
  if new.base_updated_at is distinct from old.updated_at then
    -- 取得した後に他の端末が変えた。次の同期で新しい版を取り直して合わせる
    return null;
  end if;
  new.updated_at := greatest(now(), old.updated_at + interval '1 microsecond');
  new.base_updated_at := null;
  return new;
end;
$$;
