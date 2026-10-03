-- ===========================================================================
-- push 購読の endpoint は、ブラウザのプッシュサービスの URL だけにする。
-- 送信（Edge Function daily-reminders）はこの URL へサーバーから POST するので、任意の宛先を入れさせない。
-- 対象: Chrome 系（FCM）・Firefox（Mozilla）・Safari（Apple）・旧 Edge（Windows）。
-- `supabase/functions/_shared/pushEndpoint.ts` と同じ形にそろえる。
-- 合わない行は消してから制約を付ける（消えた端末は次にアプリを開いたとき登録し直す）。何度流しても同じ形になる。
-- ===========================================================================
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_host_check;

delete from public.push_subscriptions
where endpoint !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/';

alter table public.push_subscriptions add constraint push_subscriptions_endpoint_host_check check (
  endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/'
);
