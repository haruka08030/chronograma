-- 設定の「お問い合わせ・フィードバック」から送られた文面を残す表（#34）。
-- - 送れるのはログインしている人だけ。端末は本人の行の insert だけで、送ったものを読む・変える・消すことはできない。
--   見るのは SQL Editor（service_role）から。返事は `auth.users` のメールアドレスへ
-- - 文面は 1〜2000 文字（前後の空白を除いて空でないこと）。版とブラウザは不具合を確かめるため（端末の `errorReport.ts` と同じ上限）
-- - 1 人 24 時間に 20 件まで（超えたら errcode `P0001`・メッセージ `feedback_rate_limited` で断る）
-- - アカウントを削除すると消える（on delete cascade）
-- 何度流しても同じ形になる。

create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  message     text not null,
  app_version text,
  user_agent  text
);

alter table public.feedback drop constraint if exists feedback_size_check;
alter table public.feedback add constraint feedback_size_check check (
  length(btrim(message)) >= 1
  and length(message) <= 2000
  and coalesce(length(app_version), 0) <= 100
  and coalesce(length(user_agent), 0) <= 500
);

-- 1 人の直近 24 時間を数える・新しい順に読む
create index if not exists feedback_user_id_created_at_idx on public.feedback (user_id, created_at);

-- 端末からは本人の行の insert だけ（読めない）。user_id は auth.uid() の既定値で入り、別の人の id は RLS で断る
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant insert (message, app_version, user_agent, user_id) on public.feedback to authenticated;
drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback for insert to authenticated with check ((select auth.uid()) = user_id);

-- 送りすぎを断る。端末には select の権限が無いので SECURITY DEFINER で数える。時刻はサーバーの now() にする
create or replace function public.limit_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  if (
    select count(*) from public.feedback f
    where f.user_id = new.user_id and f.created_at > now() - interval '24 hours'
  ) >= 20 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.limit_feedback() from public, anon, authenticated;

drop trigger if exists limit_feedback on public.feedback;
create trigger limit_feedback before insert on public.feedback
  for each row execute function public.limit_feedback();
