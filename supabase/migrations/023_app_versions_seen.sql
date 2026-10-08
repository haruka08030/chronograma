-- どの版のアプリがまだ同期しているか（#360）。版の下限（`app_config.min_sync_version`、017）をいつ上げてよいかを決める材料。
-- - 1 行 = 1 人 × アプリの版（`VITE_APP_VERSION`）× 同期の取り決めの版（`SYNC_PROTOCOL_VERSION`）。`last_seen` はその組で最後に同期を始めたサーバーの時刻
-- - 端末は同期の最初（版の下限を読んだ直後）に `note_app_version` を呼ぶ。呼ぶのは 1 日 1 回まで（`src/lib/versionSeen.ts`、端末ごと・人ごと）。
--   何度呼んでも同じ行の last_seen が進むだけ（upsert）
-- - 端末からは表を読めず、書けない。書くのは関数だけ（SECURITY DEFINER、user_id は auth.uid()、時刻はサーバーの now()）。
--   表に直接 upsert させると、on conflict do update が既存の行を読むため本人の select の権限と RLS の select ポリシーまで要り、
--   last_seen も端末の時計になる。関数ならどちらも要らない
-- - 1 人あたり last_seen の新しい 20 行まで（古い版の行は書くたびに消す）。見るのは SQL Editor（service_role）から。数える SQL は `supabase/metrics/versions.sql`
-- 何度流しても同じ形になる。

create table if not exists public.app_versions_seen (
  user_id               uuid not null references auth.users (id) on delete cascade,
  app_version           text not null,
  sync_protocol_version integer not null,
  first_seen            timestamptz not null default now(),
  last_seen             timestamptz not null default now(),
  primary key (user_id, app_version, sync_protocol_version)
);

alter table public.app_versions_seen drop constraint if exists app_versions_seen_shape_check;
alter table public.app_versions_seen add constraint app_versions_seen_shape_check check (
  length(app_version) between 1 and 100
  and sync_protocol_version between 0 and 10000
);

-- 版ごとに直近 n 日の人数を数える
create index if not exists app_versions_seen_last_seen_idx on public.app_versions_seen (last_seen);

-- 端末（anon / authenticated）からは何もできない。RLS は有効にしてポリシーは置かない
alter table public.app_versions_seen enable row level security;
revoke all on public.app_versions_seen from anon, authenticated;

create or replace function public.note_app_version(p_app_version text, p_sync_protocol_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.app_versions_seen as s (user_id, app_version, sync_protocol_version, first_seen, last_seen)
  values (uid, p_app_version, p_sync_protocol_version, now(), now())
  on conflict (user_id, app_version, sync_protocol_version) do update set last_seen = excluded.last_seen;
  -- 新しい 20 行より古いもの（もう使っていない版）を消す
  delete from public.app_versions_seen s
  where s.user_id = uid
    and (s.app_version, s.sync_protocol_version) not in (
      select k.app_version, k.sync_protocol_version from public.app_versions_seen k
      where k.user_id = uid
      order by k.last_seen desc
      limit 20
    );
end;
$$;

revoke all on function public.note_app_version(text, integer) from public, anon, authenticated;
grant execute on function public.note_app_version(text, integer) to authenticated;
