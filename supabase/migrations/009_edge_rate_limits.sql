-- ===========================================================================
-- Edge Function の呼び出し回数の上限（利用者ごと・機能ごと）。
-- 外のサービス（Google・Notion・学校の Canvas）へサーバーから送る回数を、1 人が際限なく増やせないようにする。
-- 数えるのは `hit_rate_limit`（Edge Function が service_role で呼ぶ。`supabase/functions/_shared/rateLimit.ts`）。
-- 時間の枠は固定（枠の始まりから p_window_seconds 秒）。ブラウザからは読めも呼べもしない。何度流しても同じ形になる。
-- ===========================================================================
create table if not exists public.edge_rate_limits (
  user_id      uuid not null references auth.users (id) on delete cascade,
  bucket       text not null,
  window_start timestamptz not null default now(),
  hits         integer not null default 0,
  primary key (user_id, bucket)
);

alter table public.edge_rate_limits enable row level security;  -- ポリシーなし（サーバー専用）

-- 1 回数え、枠の上限以内なら true
create or replace function public.hit_rate_limit(p_user uuid, p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.edge_rate_limits as r (user_id, bucket, window_start, hits)
  values (p_user, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update set
    window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
    hits         = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning hits into n;
  return n <= p_limit;
end;
$$;

revoke all on function public.hit_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(uuid, text, integer, integer) to service_role;
