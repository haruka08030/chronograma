-- 同期する行（lists / list_sections / tasks / habits）を消したことを残す表 sync_tombstones。
-- 端末は前回の取得より後に変わった行と消えた行だけを取る（差分の取得）。行は本当に消すので、消えたことはこの表で知らせる。
-- - 行を消すと（どの版のアプリから消しても）トリガーが (user_id, 表の名前, 行の id) を残す。同じ行をまた消したら deleted_at を新しくする
-- - 同じ id の行がまた入ったら（元に戻す・他の端末で編集していた行を送り直す）、その行の印を消す。
--   印があれば、その行はいまサーバーに無い
-- - アカウントの削除（auth.users からの cascade）では残さず、それまでの印も消す
-- - 端末からは読むだけ（RLS は本人の行の select だけ）。書くのはトリガーだけ（SECURITY DEFINER、search_path は空）
-- - 古い印は消してよい。端末は 6 時間ごと（と開いたとき）に全部を取り直すので、それより古い印は使わない
-- 何度流しても同じ形になる。

create table if not exists public.sync_tombstones (
  user_id     uuid not null,
  table_name  text not null,
  row_id      text not null,
  deleted_at  timestamptz not null default now(),
  primary key (user_id, table_name, row_id)
);
-- user_id に auth.users への外部キーは付けない（アカウントの削除の cascade の途中で印を入れると、外部キーの確かめで削除が失敗する）

alter table public.sync_tombstones drop constraint if exists sync_tombstones_table_name_check;
alter table public.sync_tombstones add constraint sync_tombstones_table_name_check
  check (table_name in ('lists', 'list_sections', 'tasks', 'habits'));

create index if not exists sync_tombstones_user_deleted_idx on public.sync_tombstones (user_id, deleted_at);

alter table public.sync_tombstones enable row level security;
drop policy if exists sync_tombstones_select_own on public.sync_tombstones;
create policy sync_tombstones_select_own on public.sync_tombstones for select using (auth.uid() = user_id);
revoke insert, update, delete, truncate on public.sync_tombstones from anon, authenticated;

-- 文ごとに 1 回（transition table）。消した行・入れた行をまとめて扱う
create or replace function public.record_sync_tombstones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.sync_tombstones (user_id, table_name, row_id, deleted_at)
    select g.user_id, tg_table_name, g.id, now()
    from gone_rows g
    -- アカウントの削除では auth.users の行が先に消えている
    where exists (select 1 from auth.users u where u.id = g.user_id)
    on conflict (user_id, table_name, row_id) do update set deleted_at = excluded.deleted_at;
    -- アカウントの削除: それまでに残した印も消す
    delete from public.sync_tombstones t
    where t.user_id in (
      select distinct g.user_id from gone_rows g
      where not exists (select 1 from auth.users u where u.id = g.user_id)
    );
  else
    -- upsert で既にある行を更新した分は new_rows に入らない（新しく入った行だけ）
    delete from public.sync_tombstones t
    using new_rows n
    where t.user_id = n.user_id and t.table_name = tg_table_name and t.row_id = n.id;
  end if;
  return null;
end;
$$;

revoke all on function public.record_sync_tombstones() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['lists', 'list_sections', 'tasks', 'habits'] loop
    execute format('drop trigger if exists record_sync_tombstones_delete on public.%I', t);
    execute format(
      'create trigger record_sync_tombstones_delete after delete on public.%I referencing old table as gone_rows for each statement execute function public.record_sync_tombstones()',
      t
    );
    execute format('drop trigger if exists record_sync_tombstones_insert on public.%I', t);
    execute format(
      'create trigger record_sync_tombstones_insert after insert on public.%I referencing new table as new_rows for each statement execute function public.record_sync_tombstones()',
      t
    );
  end loop;
end $$;
