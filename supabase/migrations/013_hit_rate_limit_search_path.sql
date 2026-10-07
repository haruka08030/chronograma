-- 001 の hit_rate_limit（Edge Function の呼び出し回数を数える。SECURITY DEFINER）の search_path を空に固定する。
-- 名前はすべてスキーマ付きで書く（public の表・pg_catalog の関数）。動きと権限は 001 と同じ。
-- 何度流しても同じ形になる。

create or replace function public.hit_rate_limit(p_user uuid, p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.edge_rate_limits as r (user_id, bucket, window_start, hits)
  values (p_user, p_bucket, pg_catalog.now(), 1)
  on conflict (user_id, bucket) do update set
    window_start = case when r.window_start <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds) then pg_catalog.now() else r.window_start end,
    hits         = case when r.window_start <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning hits into n;
  return n <= p_limit;
end;
$$;

revoke all on function public.hit_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(uuid, text, integer, integer) to service_role;
