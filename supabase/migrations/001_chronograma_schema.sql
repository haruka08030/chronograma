-- Chronograma: Supabase のスキーマ一式。
-- 新しいプロジェクトの SQL Editor でこのファイル全体を 1 回実行すれば揃う（Postgres 15 以上）。
--
-- 方針
--   - 利用者の行は主キー (user_id, id)。未分類 '__inbox__' のように ID が全員で同じでもぶつからない。
--     外部キーも (user_id, ...) にして、他人の行を指せないようにする。
--   - RLS: 利用者のデータは本人だけが読み書きできる。
--     外部サービスのトークン（google_oauth / notion_connection / canvas_connection）はブラウザに出さないので
--     ポリシーを置かず、Edge Function が service_role で読み書きする。


-- ===========================================================================
-- lists
-- ===========================================================================
create table if not exists public.lists (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  name       text not null,
  color      text not null default '#6366f1',
  -- tasks: やること / someday: いつか / checklist: 買い物など。tasks 以外は予定・統計・通知から外す
  kind       text not null default 'tasks' check (kind in ('tasks', 'someday', 'checklist')),
  -- 間に挿入すると中間値（例 62.5）になるので小数
  sort_order double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);


-- ===========================================================================
-- list_sections
-- ===========================================================================
create table if not exists public.list_sections (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  list_id    text not null,
  name       text not null default '',
  sort_order double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  -- リストを消しても中身は道連れにしない（004 を参照）。アカウントの削除では auth.users からの cascade で消える
  constraint list_sections_list_fkey
    foreign key (user_id, list_id) references public.lists (user_id, id) on delete no action
);

create index if not exists list_sections_user_list_idx on public.list_sections (user_id, list_id);


-- ===========================================================================
-- tasks（タスク・予定・記録）
-- ===========================================================================
create table if not exists public.tasks (
  user_id          uuid not null references auth.users (id) on delete cascade,
  id               text not null,
  list_id          text not null,
  section_id       text,
  parent_id        text,
  sort_order       double precision not null default 0,

  title            text not null default '',
  description      text not null default '',
  location         text,
  priority         text not null default 'none',
  tags             jsonb not null default '[]'::jsonb,

  -- 日付・時刻（'HH:mm'）は time_zone_anchor のタイムゾーンで書く
  due_date         date,
  due_time         text,
  scheduled_date   date,
  start_time       text,
  end_time         text,
  end_date         date,
  recurrence       jsonb,
  -- 入力したタイムゾーン（null = アプリのタイムゾーンに従う）
  time_zone        text,
  -- 日付・時刻の列がどのタイムゾーンで書かれているか。各端末が読み込み時に同じ瞬間のまま書き直す
  time_zone_anchor text,
  -- タスクごとの通知 [{ "at": "start" | "due" | "dueDay", "minutes": n }]（null = 設定の既定）
  reminders        jsonb,

  -- 記録（time log）
  is_time_log      boolean not null default false,
  is_sleep         boolean not null default false,  -- 睡眠。記録の時間・分類の集計から外す
  color            text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),  -- null = 分類の色
  habit_id         text,  -- 作った元の習慣。習慣を消しても記録は残すので外部キーにしない

  completed        boolean not null default false,
  completed_at     timestamptz,
  archived_at      timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  primary key (user_id, id),
  constraint tasks_list_fkey
    foreign key (user_id, list_id) references public.lists (user_id, id) on delete no action,
  -- セクションが消えたら section_id だけ null にする（user_id は残す）
  constraint tasks_section_fkey
    foreign key (user_id, section_id) references public.list_sections (user_id, id)
    on delete set null (section_id)
);

create index if not exists tasks_user_list_idx    on public.tasks (user_id, list_id);
create index if not exists tasks_user_section_idx on public.tasks (user_id, section_id);


-- ===========================================================================
-- habits
-- ===========================================================================
create table if not exists public.habits (
  user_id         uuid not null references auth.users (id) on delete cascade,
  id              text not null,
  title           text not null default '',
  color           text not null default '#f97316',
  -- none: 時間なし / fixed: 開始時刻だけ / range: 開始〜終了
  time_mode       text not null default 'none' check (time_mode in ('none', 'fixed', 'range')),
  start_time      text,
  end_time        text,
  frequency       jsonb not null default '{"type":"daily"}'::jsonb,
  completed_dates jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, id)
);


-- ===========================================================================
-- push_subscriptions（Web Push の購読。1 端末 = 1 行）
-- Edge Function daily-reminders が pg_cron から呼ばれ、service_role で読む。
-- ===========================================================================
create table if not exists public.push_subscriptions (
  endpoint               text primary key,
  user_id                uuid not null references auth.users (id) on delete cascade,
  p256dh                 text not null,
  auth                   text not null,
  -- 端末の IANA タイムゾーン。通知時刻はこのタイムゾーンで判定する
  timezone               text not null default 'UTC',
  lang                   text not null default 'ja',

  -- 朝のまとめ（'HH:mm'、null = オフ）と、最後に送った日（1 日 1 回）。wrap_up_* は廃止（夕方の締め）
  plan_time              text check (plan_time is null or plan_time ~ '^\d{2}:\d{2}$'),
  wrap_up_time           text check (wrap_up_time is null or wrap_up_time ~ '^\d{2}:\d{2}$'),
  last_plan_sent         date,
  last_wrap_up_sent      date,

  -- 予定の開始 N 分前（null = オフ）
  event_reminder_minutes integer
    check (event_reminder_minutes is null or event_reminder_minutes between 1 and 120),
  -- 締切の前（前日 20:00 ＋ 時刻つきは 3 時間前）
  due_reminders          boolean not null default false,
  -- 予定のあとの記録の確認
  record_prompts         boolean not null default false,
  -- 送った通知の鍵（同じ通知を二度送らない）: { "keys": ["task:start:10:yyyy-mm-dd", ...] }
  reminder_sent          jsonb,
  -- 動いているタイマー（止め忘れの通知用）と、通知済みのタイマーの開始時刻
  timer_started_at       timestamptz,
  timer_title            text,
  timer_notified_for     timestamptz,
  -- 廃止（reminder_sent に統合）
  event_notified         jsonb,
  due_notified           jsonb,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);


-- ===========================================================================
-- google_oauth（Google カレンダーのリフレッシュトークン。サーバー専用）
-- ===========================================================================
create table if not exists public.google_oauth (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  scope         text not null default 'https://www.googleapis.com/auth/calendar.readonly',
  updated_at    timestamptz not null default now()
);


-- ===========================================================================
-- notion_connection（Notion の統合トークンと対象データベース。サーバー専用）
-- ===========================================================================
create table if not exists public.notion_connection (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  token       text not null,
  database_id text not null,
  -- { statusProperty, dateProperty, actionStatuses: string[], nextStatus: { [from]: to } }
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);


-- ===========================================================================
-- canvas_connection（Canvas LMS のアクセストークンと学校の URL。学校ごとに 1 行。サーバー専用）
-- ===========================================================================
create table if not exists public.canvas_connection (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,  -- 学校の Canvas のホスト名 'xxx.instructure.com'
  base_url   text not null,  -- 'https://xxx.instructure.com'
  -- 'token': アクセストークンで読み書き / 'ical': トークンを作れない学校向けに、カレンダーフィードを読むだけ
  kind       text not null default 'token' check (kind in ('token', 'ical')),
  token      text,           -- kind = 'token' のとき
  feed_url   text,           -- kind = 'ical' のとき（URL そのものが鍵なのでブラウザに出さない）
  user_name  text,
  -- トークンの期限（null = 期限なしか、分からない）。同期のついでに 1 日 1 回確かめて、近ければ延ばす
  token_expires_at timestamptz,
  token_checked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);


-- ===========================================================================
-- RLS
-- ===========================================================================
alter table public.lists              enable row level security;
alter table public.list_sections      enable row level security;
alter table public.tasks              enable row level security;
alter table public.habits             enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.google_oauth       enable row level security;  -- ポリシーなし（サーバー専用）
alter table public.notion_connection  enable row level security;  -- ポリシーなし（サーバー専用）
alter table public.canvas_connection  enable row level security;  -- ポリシーなし（サーバー専用）

-- 本人の行だけ select / insert / update / delete できる（<表>_select_own など）
do $$
declare t text;
begin
  foreach t in array array['lists', 'list_sections', 'tasks', 'habits', 'push_subscriptions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t || '_delete_own', t);
  end loop;
end $$;
