-- どの版のアプリがまだ同期しているか（本番の SQL Editor で流す。service_role で読む）。`app_versions_seen`（`023`）。
-- 端末は同期の最初に 1 日 1 回、`(版, 同期の取り決めの版)` を書く（`src/lib/versionSeen.ts`）。この仕組みより前の版のアプリは書かないので出てこない。
-- 版の下限 `app_config.min_sync_version`（`017`）を N に上げると、取り決めの版が N より小さい人は送れなくなる（読み込み直しを促す）。
-- 上げる前に 2 で「N より小さい版の人」がほぼ 0 になったかを見る。
-- 1 つずつ選んで流す。

-- 1. 版ごとの直近 7 日の人数（新しく見た版から）
select
  app_version,
  sync_protocol_version,
  count(distinct user_id) as users,
  max(last_seen) as last
from public.app_versions_seen
where last_seen > now() - interval '7 days'
group by app_version, sync_protocol_version
order by last desc;

-- 2. 同期の取り決めの版ごとの直近 7 日の人数と、今の下限（下限より小さい版の行は「読み込み直しを促されている人」）
select
  s.sync_protocol_version,
  count(distinct s.user_id) as users,
  max(s.last_seen) as last,
  (select (value)::int from public.app_config where key = 'min_sync_version') as min_sync_version
from public.app_versions_seen s
where s.last_seen > now() - interval '7 days'
group by s.sync_protocol_version
order by s.sync_protocol_version;
