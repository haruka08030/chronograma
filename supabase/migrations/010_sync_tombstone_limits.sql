-- 消えた行の印 sync_tombstones（008）に上限と自動削除を付ける。入れて消すを繰り返しても際限なく増えないように。
-- - 1 人が持てる印は 50,000 件まで。超えたら古い印から消す（断らない。印を入れるのは利用者の DELETE の中なので、
--   断ると削除そのものが失敗する）
-- - 上限で消した印のうち一番新しい deleted_at を sync_tombstone_purges.last_deleted_at に残す。
--   端末は差分の目印がこれより前なら（取るはずの印が消えている）全部を取り直す。端末からは本人の行の select だけ
-- - 30 日より古い印は毎日消す（pg_cron のジョブ purge-sync-tombstones、毎日 03:17 UTC）。端末は前回の取得が 30 日より前なら全部を取り直す。
--   pg_cron が無い DB（新しいプロジェクトで有効にしていない）ではジョブを作らない。有効にしてから流し直せば作る
-- 何度流しても同じ形になる。

create table if not exists public.sync_tombstone_purges (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  last_deleted_at timestamptz not null
);

alter table public.sync_tombstone_purges enable row level security;
drop policy if exists sync_tombstone_purges_select_own on public.sync_tombstone_purges;
create policy sync_tombstone_purges_select_own on public.sync_tombstone_purges for select using (auth.uid() = user_id);
revoke insert, update, delete, truncate on public.sync_tombstone_purges from anon, authenticated;

-- 文ごとに 1 回。新しく入った印がある利用者だけ、上限（引数）を超えた分を古い順に消す。数えるのは索引 (user_id, deleted_at) を新しい順に
create or replace function public.trim_sync_tombstones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap constant bigint := tg_argv[0]::bigint;
  uid uuid;
  through timestamptz;
begin
  for uid in select distinct n.user_id from new_rows n loop
    with victims as (
      select t.table_name, t.row_id, t.deleted_at
      from public.sync_tombstones t
      where t.user_id = uid
      order by t.deleted_at desc, t.table_name desc, t.row_id desc
      offset cap
    ),
    gone as (
      delete from public.sync_tombstones t
      using victims v
      where t.user_id = uid and t.table_name = v.table_name and t.row_id = v.row_id
      returning t.deleted_at
    )
    select max(g.deleted_at) into through from gone g;
    if through is not null then
      insert into public.sync_tombstone_purges (user_id, last_deleted_at)
      values (uid, through)
      on conflict (user_id) do update
        set last_deleted_at = greatest(public.sync_tombstone_purges.last_deleted_at, excluded.last_deleted_at);
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.trim_sync_tombstones() from public, anon, authenticated;

drop trigger if exists trim_sync_tombstones on public.sync_tombstones;
create trigger trim_sync_tombstones after insert on public.sync_tombstones
  referencing new table as new_rows for each statement execute function public.trim_sync_tombstones('50000');

do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    -- 同じ名前のジョブがあれば置き換わる
    execute $cron$
      select cron.schedule(
        'purge-sync-tombstones',
        '17 3 * * *',
        $job$delete from public.sync_tombstones where deleted_at < now() - interval '30 days'$job$
      )
    $cron$;
  end if;
end $$;
