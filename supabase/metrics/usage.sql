-- 使われ方（本番の SQL Editor で流す。service_role で読む）。新しい計測は入れず、同期で既にある表を読むだけ（書き込みはしない）。
-- 数と日付だけを見る。どの問い合わせも title・description・location・category・note の中身を選ばない
-- （ラベル名は「〇〇社 面接」のように中身になりうる。6 は category が null かどうかだけを見る）。メールアドレスも出さない。
-- 1 人ごとの行を人に見せる・聞き取り（#33）で本人と突き合わせるのは、本人の了解があるときだけ。
--
-- 数え方の決まり
-- - 数えられるのはログインして同期した人だけ。手元だけで使う人は入らない
-- - `tasks.created_at`・`completed_at` は端末の時刻。ログイン前に手元で作った行は登録より前の時刻になる（下限を付けずに数える）
-- - ゴミ箱を空にした行は残らないので、数は少なめに出る。ゴミ箱の行（`deleted_at` あり）は 1〜4 では使った印として数え、5・6 では外す
-- - 時間に置いた To-Do: `not is_time_log and not is_sleep and not is_event and start_time is not null`
-- - 記録: `is_time_log and not is_sleep`
-- - 予定（授業・バイト、`is_event`、`014`）は時間に置いた To-Do に数えない
-- - 作った人と試しのアカウントは外す: 各問い合わせの頭の `u` の一覧（`auth.users.email`）に書く。一覧はどの問い合わせも同じにする
--   （人数が少ないうちは 1 人分で割合が大きく動く）
--
-- #274（何のアプリかの一文）が本番に出た日: 未記入。出たらここに書き、1 の登録週をその日の前後で比べる
-- （人数が少ないうちは数より #33 の「一言で言うと」の答えを優先する）
--
-- 1 つずつ選んで流す。

-- 1. 登録した週ごと: 3 日以内に「時間に置いた」「記録した」「両方」の人数
with u as (
  select id, created_at as signed_up from auth.users
  where coalesce(email, '') <> all (array['owner@example.com', 'test@example.com'])
),
placed as (
  select user_id, min(created_at) as first_at from public.tasks
  where not is_time_log and not is_sleep and not is_event and start_time is not null
  group by user_id
),
logged as (
  select user_id, min(created_at) as first_at from public.tasks
  where is_time_log and not is_sleep
  group by user_id
)
select
  date_trunc('week', u.signed_up)::date as cohort_week,
  count(*) as signed_up,
  count(*) filter (where p.first_at < u.signed_up + interval '3 days') as placed_3d,
  count(*) filter (where l.first_at < u.signed_up + interval '3 days') as logged_3d,
  count(*) filter (
    where p.first_at < u.signed_up + interval '3 days'
      and l.first_at < u.signed_up + interval '3 days'
  ) as activated_3d
from u
left join placed p on p.user_id = u.id
left join logged l on l.user_id = u.id
group by 1
order by 1;

-- 2. 2 週目に戻ってきたか（登録から 7〜13 日目に行を作った・完了した・習慣を付けた・気分を付けた人数）。登録から 14 日たった人だけ
with u as (
  select id, created_at as signed_up from auth.users
  where coalesce(email, '') <> all (array['owner@example.com', 'test@example.com'])
    and created_at < now() - interval '14 days'
),
activity as (
  select user_id, created_at as at from public.tasks
  union all
  select user_id, completed_at from public.tasks where completed_at is not null
  union all
  -- 習慣の達成日（'yyyy-MM-dd'）。形の違う値は飛ばす
  select h.user_id, (d.value #>> '{}')::date::timestamptz
  from public.habits h
  cross join lateral jsonb_array_elements(h.completed_dates) d
  where jsonb_typeof(h.completed_dates) = 'array'
    and d.value #>> '{}' ~ '^\d{4}-\d{2}-\d{2}$'
  union all
  -- 1 日の気分（`025`）。記号を選んだ日だけ（値は読まない）
  select user_id, day::timestamptz from public.day_moods where mood is not null
),
week2 as (
  select a.user_id
  from activity a
  join u on u.id = a.user_id
  where a.at >= u.signed_up + interval '7 days'
    and a.at < u.signed_up + interval '14 days'
  group by a.user_id
)
select
  date_trunc('week', u.signed_up)::date as cohort_week,
  count(*) as signed_up,
  count(w.user_id) as active_week2
from u
left join week2 w on w.user_id = u.id
group by 1
order by 1;

-- 3. 直近 28 日に記録した日の数ごとの人数（記録の日 = due_date。記録の無い人は出ない）
with u as (
  select id from auth.users
  where coalesce(email, '') <> all (array['owner@example.com', 'test@example.com'])
)
select days_logged, count(*) as users
from (
  select t.user_id, count(distinct t.due_date) as days_logged
  from public.tasks t
  join u on u.id = t.user_id
  where t.is_time_log and not t.is_sleep and t.due_date >= current_date - 28
  group by t.user_id
) x
group by 1
order by 1;

-- 4. 機能ごとに使ったことのある人数（主役の「時間に置く・記録」と比べる。#274 の「その他にできること」の材料）
with u as (
  select id from auth.users
  where coalesce(email, '') <> all (array['owner@example.com', 'test@example.com'])
)
select
  (select count(distinct user_id) from public.tasks
     where user_id in (select id from u) and is_time_log and not is_sleep) as logging,
  (select count(distinct user_id) from public.tasks
     where user_id in (select id from u)
       and not is_time_log and not is_sleep and not is_event and start_time is not null) as placing,
  (select count(distinct user_id) from public.tasks
     where user_id in (select id from u) and is_event) as events,
  (select count(distinct user_id) from public.tasks
     where user_id in (select id from u) and is_sleep) as sleep,
  (select count(distinct user_id) from public.habits
     where user_id in (select id from u)
       and case when jsonb_typeof(completed_dates) = 'array' then jsonb_array_length(completed_dates) else 0 end > 0) as habits,
  (select count(distinct t.user_id) from public.tasks t
     join public.lists l on l.user_id = t.user_id and l.id = t.list_id
     where t.user_id in (select id from u) and l.kind = 'someday') as someday,
  (select count(distinct t.user_id) from public.tasks t
     join public.lists l on l.user_id = t.user_id and l.id = t.list_id
     where t.user_id in (select id from u) and l.kind = 'checklist') as checklist,
  (select count(distinct user_id) from public.push_subscriptions
     where user_id in (select id from u)) as push,
  (select count(distinct user_id) from public.push_subscriptions
     where user_id in (select id from u) and record_prompts) as record_prompts,
  -- google_oauth・notion_connection は主キーが user_id（1 人 1 行）。canvas_connection は学校ごとに 1 行（主キー (user_id, id)）
  (select count(*) from public.google_oauth where user_id in (select id from u)) as google,
  (select count(*) from public.notion_connection where user_id in (select id from u)) as notion,
  (select count(distinct user_id) from public.canvas_connection where user_id in (select id from u)) as canvas;

-- 5. 人×週ごとの、時間に置いた To-Do の長さの合計と記録の合計（分）と比（記録 ÷ 予定）。
--    #275・#276・#278・#282 が効いたかは、比が 1 に近づくかで見る。持ち越した予定が消えるうちは（#158 まで）比は甘く出る。
--    長さはアプリ（`taskTimedInterval`）と同じ: 置く日は To-Do = scheduled_date ?? due_date、記録 = due_date。
--    終わりは end_date ?? 置く日。end_date が無く終わりが始まり以前なら、記録は翌日まで、To-Do は 0:00 終わりだけ翌日の 0:00。
--    週は始まりの日で決める（日・週をまたぐ行も始まりの週に全部入れる）。ゴミ箱・アーカイブは入れない。1 行に 1 人の ID（uuid）が出る
with u as (
  select id from auth.users
  where coalesce(email, '') <> all (array['owner@example.com', 'test@example.com'])
),
timed as (
  select
    t.user_id,
    t.is_time_log,
    case when t.is_time_log then t.due_date else coalesce(t.scheduled_date, t.due_date) end as day,
    t.start_time::time as st,
    t.end_time::time as et,
    t.end_date
  from public.tasks t
  join u on u.id = t.user_id
  join public.lists l on l.user_id = t.user_id and l.id = t.list_id
  where not t.is_sleep
    and t.deleted_at is null
    and t.archived_at is null
    -- 記録は全部（夜の締めの「記録」と同じ）。To-Do は予定・サブタスク・いつか / チェックリストを外す
    and (t.is_time_log or (not t.is_event and t.parent_id is null and l.kind = 'tasks'))
    -- 'HH:mm' の形の行だけ（形の違う値で time への変換を落とさない）
    and t.start_time ~ '^([01]\d|2[0-3]):[0-5]\d$'
    and t.end_time ~ '^([01]\d|2[0-3]):[0-5]\d$'
),
spans as (
  select
    user_id,
    is_time_log,
    day,
    extract(epoch from (
      (coalesce(end_date, day) + et)
      + case
          when end_date is null and et <= st and (is_time_log or et = time '00:00') then interval '1 day'
          else interval '0'
        end
      - (day + st)
    )) / 60 as minutes
  from timed
  where day is not null
)
select
  user_id,
  date_trunc('week', day)::date as week,
  round(sum(minutes) filter (where not is_time_log)) as planned_minutes,
  round(sum(minutes) filter (where is_time_log)) as logged_minutes,
  round(
    (sum(minutes) filter (where is_time_log)
      / nullif(sum(minutes) filter (where not is_time_log), 0))::numeric,
    2
  ) as logged_per_planned
from spans
where minutes > 0
group by user_id, 2
order by 2, user_id;

-- 6. 週ごとの記録のうち、ラベルの無いもの（category も color も null）の割合（#242 の「止めたあとにラベルを聞く」が効いたか）。
--    週は記録の日（due_date）で決める。ゴミ箱の記録は入れない
with u as (
  select id from auth.users
  where coalesce(email, '') <> all (array['owner@example.com', 'test@example.com'])
)
select
  date_trunc('week', t.due_date)::date as week,
  count(*) as logs,
  count(*) filter (where t.category is null and t.color is null) as unlabeled,
  round(100.0 * count(*) filter (where t.category is null and t.color is null) / count(*), 1) as unlabeled_pct,
  count(distinct t.user_id) as users
from public.tasks t
join u on u.id = t.user_id
where t.is_time_log
  and not t.is_sleep
  and t.deleted_at is null
  and t.due_date is not null
group by 1
order by 1;
