-- 同期する行（lists / list_sections / tasks / habits）の更新時刻をサーバーが付け、古い版をもとにした書き込みを断る。
-- - base_updated_at: 端末が「この版をもとに変えた」と送るサーバーの updated_at（取得した行の値そのまま）。
--   行が無いはずのとき（新しい行）は '-infinity'。行には残さない（null にしてから書く）
-- - base_updated_at を送った書き込み:
--     更新はサーバーの行の updated_at が base_updated_at と同じときだけ通す（違えば何もしない＝その行は返らない）。
--     通した行・新しく足した行の updated_at はサーバーの時刻（前の値より必ず新しくする）
-- - base_updated_at を送らない書き込み（前の版のアプリ）: 前と同じ。updated_at は端末の値のまま、サーバーの行より古ければ何もしない
-- 既にある行の値は変えない。何度流しても同じ形になる。

alter table public.lists         add column if not exists base_updated_at timestamptz;
alter table public.list_sections add column if not exists base_updated_at timestamptz;
alter table public.tasks         add column if not exists base_updated_at timestamptz;
alter table public.habits        add column if not exists base_updated_at timestamptz;

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
  -- 列を送らない書き込み（前の版のアプリ）では、行に残っている値がそのまま来る。行に残るのは
  -- 上の確かめと実際の挿入の間に行が消えたときだけ。送った値ではないので、前の版の書き込みとして扱う
  if new.base_updated_at is null or (old.base_updated_at is not null and new.base_updated_at = old.base_updated_at) then
    new.base_updated_at := null;
    -- 前の版のアプリ: 端末の時刻で古ければ捨てる
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

do $$
declare t text;
begin
  foreach t in array array['lists', 'list_sections', 'tasks', 'habits'] loop
    -- 001 の skip_stale_write（端末の時刻だけで比べる）はこの 4 つの表では sync_write_guard に置き換える。user_settings は 001 のまま
    execute format('drop trigger if exists skip_stale_write on public.%I', t);
    execute format('drop trigger if exists sync_write_guard on public.%I', t);
    execute format('create trigger sync_write_guard before insert or update on public.%I for each row execute function public.sync_write_guard()', t);
  end loop;
end $$;
