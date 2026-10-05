-- 端末で起きたエラー（画面の描画・window の error / unhandledrejection・同期の失敗・部品の読み込み）を残す表。
-- 外部のサービスは使わない。ログインしている人の端末が `src/lib/errorReport.ts` から 1 件ずつ insert する。
-- 端末から読む・変える・消すことはできない（insert だけ）。見るのは SQL Editor（service_role）から。
--
-- 大きさの上限は端末の切り詰め（`errorReport.ts` の `LIMITS`）と同じ。
-- 1 人あたり新しい 500 件まで。超えた分は insert のたびに古いものから消す（エラーの送信を失敗させないよう、断らない）。
-- 30 日より古い行は pg_cron のジョブ `chronograma-client-errors-purge` が毎日消す（pg_cron が無い DB ではジョブを作らない）。
-- 何度流しても同じ形になる。

create table if not exists public.client_errors (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  kind        text not null,
  message     text not null default '',
  stack       text,
  url         text,
  app_version text,
  user_agent  text,
  extra       jsonb
);

alter table public.client_errors drop constraint if exists client_errors_kind_check;
alter table public.client_errors add constraint client_errors_kind_check
  check (kind in ('render', 'error', 'unhandledrejection', 'sync', 'chunk'));

alter table public.client_errors drop constraint if exists client_errors_size_check;
alter table public.client_errors add constraint client_errors_size_check check (
  length(message) <= 2000
  and coalesce(length(stack), 0) <= 8000
  and coalesce(length(url), 0) <= 500
  and coalesce(length(app_version), 0) <= 100
  and coalesce(length(user_agent), 0) <= 500
  and (extra is null or octet_length(extra::text) <= 4000)
);

-- 1 人あたりの件数を数える・古いものを消す（id は入れた順）。30 日の削除は created_at で
create index if not exists client_errors_user_id_id_idx on public.client_errors (user_id, id);
create index if not exists client_errors_created_at_idx on public.client_errors (created_at);

-- 端末からは本人の行の insert だけ。user_id は auth.uid() の既定値で入り、別の人の id は RLS で断る
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
grant insert (kind, message, stack, url, app_version, user_agent, extra, user_id) on public.client_errors to authenticated;
drop policy if exists client_errors_insert_own on public.client_errors;
create policy client_errors_insert_own on public.client_errors for insert to authenticated with check ((select auth.uid()) = user_id);

-- 新しく入った行がある利用者ごとに、新しい 500 件より古い行を消す（文ごとに 1 回）。
-- 端末には delete の権限が無いので SECURITY DEFINER で消す
create or replace function public.trim_client_errors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  for uid in select distinct r.user_id from new_rows r loop
    delete from public.client_errors e
    where e.user_id = uid
      and e.id <= (
        select k.id from public.client_errors k
        where k.user_id = uid
        order by k.id desc
        offset 500 limit 1
      );
  end loop;
  return null;
end;
$$;

revoke all on function public.trim_client_errors() from public, anon, authenticated;

drop trigger if exists trim_client_errors on public.client_errors;
create trigger trim_client_errors after insert on public.client_errors
  referencing new table as new_rows for each statement execute function public.trim_client_errors();

-- 30 日より古い行を毎日消す。pg_cron が入っていなければ何もしない（入れたらこのファイルを流し直す）
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'chronograma-client-errors-purge') then
      perform cron.unschedule('chronograma-client-errors-purge');
    end if;
    perform cron.schedule(
      'chronograma-client-errors-purge',
      '23 3 * * *',
      $cmd$delete from public.client_errors where created_at < now() - interval '30 days'$cmd$
    );
  end if;
end $$;
