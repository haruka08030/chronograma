-- 習慣をやめた日（habits.ended_on）。アーカイブ・ゴミ箱へ入れた日（アプリの日付）。この日から先は予定の日にせず、前の日はそのときの習慣のまま。
-- アーカイブもゴミ箱でもない行は null。前からアーカイブ・ゴミ箱にある行は、入れた時刻（早いほう）を通知の端末のタイムゾーン（無ければ UTC）の日付にして入れる。
-- 入れた行は updated_at を進める（端末の差分の取得に出す）。何度流しても同じ形になる。
alter table public.habits add column if not exists ended_on date;

update public.habits h
set ended_on = (least(h.archived_at, h.deleted_at) at time zone coalesce(
  (select p.timezone from public.push_subscriptions p where p.user_id = h.user_id order by p.endpoint limit 1),
  'UTC'))::date,
  updated_at = greatest(now(), h.updated_at + interval '1 microsecond')
where h.ended_on is null
  and (h.archived_at is not null or h.deleted_at is not null);
