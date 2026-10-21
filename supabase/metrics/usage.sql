-- 使われ方（本番の SQL Editor で流す。service_role で読む）。新しい計測は入れず、同期で既にある表を読むだけ（書き込みはしない。0 の印付けだけは別）。
-- 数と日付だけを見る。どの問い合わせも title・description・location・category・note・message・ラベル名・授業名の中身を選ばない
-- （ラベル名は「〇〇社 面接」のように中身になりうる。6 は category が null かどうかだけ、4 は配列・object の長さとキーの有無だけを見る）。
-- メールアドレスも出さない。1 人ごとの行を人に見せる・聞き取り（#33）で本人と突き合わせるのは、本人の了解があるときだけ。
--
-- 数え方の決まり
-- - 数えられるのはログインして同期した人だけ。手元だけで使う人は入らない
-- - `tasks.created_at`・`completed_at` は端末の時刻。ログイン前に手元で作った行は登録より前の時刻になる（下限を付けずに数える）
-- - 起点: その人の最初の行の時刻（`min(tasks.created_at)`）と登録（`auth.users.created_at`）の早いほう。
--   ログインは案内の 3 ステップを終えてから勧めるので、登録より前に使い始めている人が多い。登録の前に使い始めた人も同じ物差しで数える。
--   起点の日（`origin_day`）は日本時間の暦
-- - ゴミ箱を空にした行は残らないので、数は少なめに出る。ゴミ箱の行（`deleted_at` あり）は 1〜4 では使った印として数え、5・6 では外す
-- - 時間に置いた To-Do: `not is_time_log and not is_sleep and not is_event and start_time is not null`（日は `coalesce(scheduled_date, due_date)`）
-- - 記録: `is_time_log and not is_sleep`（日は `due_date`）
-- - 予定（授業・バイト、`is_event`、`014`）は時間に置いた To-Do に数えない
-- - ずれが見えた日: 同じ日に「時間に置いた To-Do か習慣の記録（`habit_id` のある記録）」と「記録」の両方がある日（一文の「同じタイムラインに並べて、ずれが見える」）。
--   習慣の記録は、習慣の時間（予定）と記録した時間（実際）が並ぶので 1 行でも数える
-- - 使い始めた: 起点の日から 3 日（0〜2 日目）のうちに、ずれが見えた日が 1 日ある（1）。続けている: 起点の日から 7〜13 日目に、ずれが見えた日が 2 日以上ある（2）
-- - 外す人（作った人・試しのアカウント）: `auth.users.raw_app_meta_data` の `metrics_exclude` が true の人。印は 0 で付ける（一覧はこのファイルに書かない）。
--   どの問い合わせも頭の `u` で同じ条件で外す（人数が少ないうちは 1 人分で割合が大きく動く）
--
-- #274（何のアプリかの一文）が本番に出た日: 2026-10-13（main への PR #366）。1・2 の起点の週をその日の前後で比べる
-- （人数が少ないうちは数より #33 の「一言で言うと」の答えを優先する）
--
-- 見る日と目標
-- - 見る日: #33 の 1 週間の始まりと終わり、そのあとは月に 1 回。流した数は Issue（#33 か使われ方の Issue）のコメントに日付つきで残す（このファイル・doc には書かない）
-- - 目標: #33 の 3〜5 人のうち、使い始めた人が 3 人、続けている人が 2 人。届かなければ、次に足す機能より先に、届かなかった人の聞き取りを読む
--
-- 1 つずつ選んで流す。

-- 0. 外す人に印を付ける（作った人・試しのアカウント。1 回だけ。下のコメントを外し、アドレスを入れて、この文だけを選んで流す）。
--    印は app_metadata（本人からは変えられない）に入る。外す人の数はその下の select で確かめる
-- update auth.users
--   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"metrics_exclude": true}'::jsonb
--   where email in ('<作った人のアドレス>', '<試しのアカウントのアドレス>');
select count(*) as excluded_users
from auth.users
where raw_app_meta_data ->> 'metrics_exclude' = 'true';

-- 1. 使い始めた: 起点の週ごとに、起点の日から 3 日のうちにずれが見えた日がある人の数と割合。起点から 3 日たった人だけ。
--    登録より前に最初の行がある人（ログインの前に案内を終えた人）の数と割合も出す。ログインしない人は数えられないので、その抜けの大きさの目安
with u as (
  select id, created_at as signed_up from auth.users
  where coalesce(raw_app_meta_data ->> 'metrics_exclude', '') <> 'true'
),
origin as (
  select
    u.id as user_id,
    least(u.signed_up, min(t.created_at)) as origin_at,
    (least(u.signed_up, min(t.created_at)) at time zone 'Asia/Tokyo')::date as origin_day,
    coalesce(min(t.created_at) < u.signed_up, false) as before_signup
  from u
  left join public.tasks t on t.user_id = u.id
  group by u.id, u.signed_up
),
plan_days as (
  select user_id, coalesce(scheduled_date, due_date) as day from public.tasks
  where not is_time_log and not is_sleep and not is_event and start_time is not null
  union
  select user_id, due_date from public.tasks
  where is_time_log and not is_sleep and habit_id is not null
),
log_days as (
  select distinct user_id, due_date as day from public.tasks
  where is_time_log and not is_sleep
),
gap_days as (
  select p.user_id, p.day from plan_days p join log_days l on l.user_id = p.user_id and l.day = p.day
  where p.day is not null
),
activated as (
  -- 日の下限は付けない（起点の前の日に置いた・記録したものも、起点の後に作った行）
  select distinct g.user_id from gap_days g join origin o on o.user_id = g.user_id
  where g.day < o.origin_day + 3
)
select
  date_trunc('week', o.origin_day)::date as cohort_week,
  count(*) as users,
  count(*) filter (where o.before_signup) as started_before_signup,
  round(100.0 * count(*) filter (where o.before_signup) / count(*), 1) as started_before_signup_pct,
  count(a.user_id) as activated_3d,
  round(100.0 * count(a.user_id) / count(*), 1) as activated_3d_pct
from origin o
left join activated a on a.user_id = o.user_id
where o.origin_at < now() - interval '3 days'
group by 1
order by 1;

-- 2. 続けている: 起点の週ごとに、起点の日から 7〜13 日目にずれが見えた日が 2 日以上ある人の数と割合。起点から 14 日たった人だけ
with u as (
  select id, created_at as signed_up from auth.users
  where coalesce(raw_app_meta_data ->> 'metrics_exclude', '') <> 'true'
),
origin as (
  select
    u.id as user_id,
    least(u.signed_up, min(t.created_at)) as origin_at,
    (least(u.signed_up, min(t.created_at)) at time zone 'Asia/Tokyo')::date as origin_day
  from u
  left join public.tasks t on t.user_id = u.id
  group by u.id, u.signed_up
),
plan_days as (
  select user_id, coalesce(scheduled_date, due_date) as day from public.tasks
  where not is_time_log and not is_sleep and not is_event and start_time is not null
  union
  select user_id, due_date from public.tasks
  where is_time_log and not is_sleep and habit_id is not null
),
log_days as (
  select distinct user_id, due_date as day from public.tasks
  where is_time_log and not is_sleep
),
gap_days as (
  select p.user_id, p.day from plan_days p join log_days l on l.user_id = p.user_id and l.day = p.day
  where p.day is not null
),
retained as (
  select g.user_id from gap_days g join origin o on o.user_id = g.user_id
  where g.day >= o.origin_day + 7 and g.day < o.origin_day + 14
  group by g.user_id
  having count(*) >= 2
)
select
  date_trunc('week', o.origin_day)::date as cohort_week,
  count(*) as users,
  count(r.user_id) as retained_week2,
  round(100.0 * count(r.user_id) / count(*), 1) as retained_week2_pct
from origin o
left join retained r on r.user_id = o.user_id
where o.origin_at < now() - interval '14 days'
group by 1
order by 1;

-- 3. 直近 28 日に記録した日の数ごとの人数（記録の日 = due_date。記録の無い人は出ない）
with u as (
  select id from auth.users
  where coalesce(raw_app_meta_data ->> 'metrics_exclude', '') <> 'true'
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

-- 4. 機能ごとの人数（1 行に 1 機能）。作り込む順番・やめる候補を決める材料。
--    - users_ever: 使ったことのある人。users_week2: 起点の日から 7〜13 日目にも使った人（日のあるものだけ。日の無いものは null。起点から 14 日たっていない人は入りにくい）。
--      pct_of_core: 主役（ずれが見えた日が 1 日でもある人、行 `core`）に対する users_ever の割合
--    - 日: 記録・置いた To-Do・睡眠・▶ から始めた記録・習慣の記録は置いた日、習慣の達成・枠を動かした日・欠席・気分はその日、ほかは作った日（端末の時刻を日本時間の暦で）
--    - 端末の中だけのもの（ふりかえりの画像・CSV / ICS の書き出し・共有から追加・ショートカット）はサーバーに残らないので数えない（#33 の聞き取りで聞く）
--    - 追加機能（`addon:<機能>`）は、オン・オフを決めた人のうちオンにした人（時間割は決めていなくても毎週の予定があればオンに見えるが、ここでは数えない）
with u as (
  select id, created_at as signed_up from auth.users
  where coalesce(raw_app_meta_data ->> 'metrics_exclude', '') <> 'true'
),
origin as (
  select
    u.id as user_id,
    (least(u.signed_up, min(t.created_at)) at time zone 'Asia/Tokyo')::date as origin_day
  from u
  left join public.tasks t on t.user_id = u.id
  group by u.id, u.signed_up
),
plan_days as (
  select user_id, coalesce(scheduled_date, due_date) as day from public.tasks
  where not is_time_log and not is_sleep and not is_event and start_time is not null
  union
  select user_id, due_date from public.tasks
  where is_time_log and not is_sleep and habit_id is not null
),
log_days as (
  select distinct user_id, due_date as day from public.tasks
  where is_time_log and not is_sleep
),
gap_days as (
  select p.user_id, p.day from plan_days p join log_days l on l.user_id = p.user_id and l.day = p.day
  where p.day is not null
),
uses (feature, user_id, day) as (
  select 'core', user_id, day from gap_days
  union all
  select 'logging', user_id, due_date from public.tasks where is_time_log and not is_sleep
  union all
  select 'placing', user_id, coalesce(scheduled_date, due_date) from public.tasks
    where not is_time_log and not is_sleep and not is_event and start_time is not null
  union all
  select 'events', user_id, (created_at at time zone 'Asia/Tokyo')::date from public.tasks where is_event
  union all
  -- 毎週の予定（`027`。時間割の授業もこれ）
  select 'weekly_events', user_id, (created_at at time zone 'Asia/Tokyo')::date from public.tasks where event_series is not null
  union all
  select 'sleep', user_id, due_date from public.tasks where is_sleep
  union all
  -- ▶ で行から始めた記録（`016`）
  select 'started_from_row', user_id, due_date from public.tasks where is_time_log and source_task_id is not null
  union all
  -- 習慣から付いた記録
  select 'habit_logs', user_id, due_date from public.tasks where is_time_log and habit_id is not null
  union all
  -- 見積もり（`015`）
  select 'estimates', user_id, (created_at at time zone 'Asia/Tokyo')::date from public.tasks
    where not is_time_log and estimate_minutes is not null
  union all
  select 'someday', t.user_id, (t.created_at at time zone 'Asia/Tokyo')::date from public.tasks t
    join public.lists l on l.user_id = t.user_id and l.id = t.list_id where l.kind = 'someday'
  union all
  -- 夢（`034`）
  select 'dreams', user_id, (created_at at time zone 'Asia/Tokyo')::date from public.tasks where someday_tier = 'dream'
  union all
  select 'checklist', t.user_id, (t.created_at at time zone 'Asia/Tokyo')::date from public.tasks t
    join public.lists l on l.user_id = t.user_id and l.id = t.list_id where l.kind = 'checklist'
  union all
  -- 習慣の達成日（'yyyy-MM-dd'）。形の違う値は飛ばす
  select 'habits', h.user_id, (d.value #>> '{}')::date
  from public.habits h
  cross join lateral jsonb_array_elements(case when jsonb_typeof(h.completed_dates) = 'array' then h.completed_dates else '[]'::jsonb end) d
  where d.value #>> '{}' ~ '^\d{4}-\d{2}-\d{2}$'
  union all
  -- 習慣の段から格子へ置いた・枠を動かした日（`018`、キーが日付）
  select 'habit_moved_slots', h.user_id, d.key::date
  from public.habits h
  cross join lateral jsonb_each(case when jsonb_typeof(h.time_overrides) = 'object' then h.time_overrides else '{}'::jsonb end) d
  where d.key ~ '^\d{4}-\d{2}-\d{2}$'
  union all
  -- 習慣の 1 回の時間の目標（`031`）
  select 'habit_time_goal', user_id, null::date from public.habits where goal_minutes is not null
  union all
  -- 1 日の気分（`025`）。記号を選んだ日だけ（値は読まない）
  select 'mood', user_id, day from public.day_moods where mood is not null
  union all
  -- ラベルの週の目安（`user_settings.log_labels` の `weeklyTargetMinutes`。ラベル名は読まない）
  select 'label_weekly_target', s.user_id, null::date
  from public.user_settings s
  where exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(s.log_labels) = 'array' then s.log_labels else '[]'::jsonb end) l
    where jsonb_typeof(l) = 'object' and l ? 'weeklyTargetMinutes'
  )
  union all
  -- よく入れる予定（`022`。中身は読まない）
  select 'event_templates', user_id, null::date from public.user_event_templates
    where case when jsonb_typeof(templates) = 'array' then jsonb_array_length(templates) else 0 end > 0
  union all
  -- 時間割の設定（時限・学期。授業は weekly_events）
  select 'timetable_settings', user_id, null::date from public.user_timetable
    where jsonb_typeof(timetable) = 'object' and timetable <> '{}'::jsonb
  union all
  -- 欠席した日（`user_timetable.timetable -> 'absences'`、授業名 → 日付の並び。授業名は読まない）
  select 'absences', t.user_id, (d.value #>> '{}')::date
  from public.user_timetable t
  cross join lateral jsonb_each(case when jsonb_typeof(t.timetable -> 'absences') = 'object' then t.timetable -> 'absences' else '{}'::jsonb end) c
  cross join lateral jsonb_array_elements(case when jsonb_typeof(c.value) = 'array' then c.value else '[]'::jsonb end) d
  where d.value #>> '{}' ~ '^\d{4}-\d{2}-\d{2}$'
  union all
  -- 追加機能のオン（`041`。キーは機能の名前 timetable / school / dues）
  select 'addon:' || e.key, a.user_id, null::date
  from public.user_addons a
  cross join lateral jsonb_each(case when jsonb_typeof(a.addons -> 'enabled') = 'object' then a.addons -> 'enabled' else '{}'::jsonb end) e
  where e.value = 'true'::jsonb
  union all
  -- 引き落とし・期限の日（`user_addons.addons -> 'dues'`。中身は読まない）
  select 'dues', user_id, null::date from public.user_addons
    where case when jsonb_typeof(addons -> 'dues') = 'array' then jsonb_array_length(addons -> 'dues') else 0 end > 0
  union all
  select 'push', user_id, null::date from public.push_subscriptions
  union all
  select 'record_prompts', user_id, null::date from public.push_subscriptions where record_prompts
  union all
  select 'google', user_id, null::date from public.google_oauth
  union all
  -- Google カレンダーへの書き込みを許可した人（`google-calendar` の WRITE_SCOPES と同じ）
  select 'google_write', user_id, null::date from public.google_oauth
    where string_to_array(scope, ' ') && array[
      'https://www.googleapis.com/auth/calendar.events.owned',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar'
    ]
  union all
  select 'notion', user_id, null::date from public.notion_connection
  union all
  select 'canvas', user_id, null::date from public.canvas_connection
  union all
  -- お問い合わせ・フィードバック（`036`。文面は読まない）
  select 'feedback', user_id, (created_at at time zone 'Asia/Tokyo')::date from public.feedback
),
core as (
  select count(distinct user_id) as n from gap_days where user_id in (select id from u)
)
select
  x.feature,
  count(distinct x.user_id) as users_ever,
  case when bool_or(x.day is not null) then
    count(distinct x.user_id) filter (where x.day >= o.origin_day + 7 and x.day < o.origin_day + 14)
  end as users_week2,
  round(100.0 * count(distinct x.user_id) / nullif((select n from core), 0), 1) as pct_of_core
from uses x
join origin o on o.user_id = x.user_id
group by x.feature
order by x.feature = 'core' desc, users_ever desc, x.feature;

-- 5. 人×週ごとの、時間に置いた To-Do の長さの合計と記録の合計（分）と比（記録 ÷ 予定）。
--    #275・#276・#278・#282 が効いたかは、比が 1 に近づくかで見る。持ち越した予定が消えるうちは（#158 まで）比は甘く出る。
--    長さはアプリ（`taskTimedInterval`）と同じ: 置く日は To-Do = scheduled_date ?? due_date、記録 = due_date。
--    終わりは end_date ?? 置く日。end_date が無く終わりが始まり以前なら、記録は翌日まで、To-Do は 0:00 終わりだけ翌日の 0:00。
--    週は始まりの日で決める（日・週をまたぐ行も始まりの週に全部入れる）。ゴミ箱・アーカイブは入れない。1 行に 1 人の ID（uuid）が出る
with u as (
  select id from auth.users
  where coalesce(raw_app_meta_data ->> 'metrics_exclude', '') <> 'true'
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
  where coalesce(raw_app_meta_data ->> 'metrics_exclude', '') <> 'true'
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
