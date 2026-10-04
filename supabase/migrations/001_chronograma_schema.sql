-- Chronograma: Supabase のスキーマ一式（Postgres 15 以上）。
-- 新しいプロジェクトはこのファイルを SQL Editor で流す。何度流しても同じ形になる。
-- 変えるときは 002 から番号順に新しいファイルを足す（コミット済みのファイルは書き換えない）。
--
-- 方針
--   - 利用者の行は主キー (user_id, id)。未分類 '__inbox__' のように ID が全員で同じでもぶつからない。
--     外部キーも (user_id, ...) にして、他人の行を指せないようにする。
--   - RLS: 利用者のデータは本人だけが読み書きできる。
--     外部サービスのトークン（google_oauth / notion_connection / canvas_connection）はブラウザに出さないので
--     ポリシーを置かず、Edge Function が service_role で読み書きする。
--   - 同期する表（lists / list_sections / tasks / habits / user_settings）は、サーバーの行より updated_at が古い更新を捨てる。
--   - 行の大きさに上限を付ける（ふつうの使い方では届かない大きさ。アプリも送る前に同じ長さで切る、`supabaseData.ts`）。


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
  primary key (user_id, id),
  constraint lists_size_check check (length(id) <= 200 and length(name) <= 500)
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
  -- リストを消しても中のセクション・タスクを道連れにしない（no action）。
  -- 端末 A がリストを消すころに端末 B がそこへ足したものを、サーバーで消さないため（A の削除は失敗し、次の同期で付け替えて消し直す）。
  -- restrict でないのは、アカウントの削除で auth.users から両方へ cascade するとき、文の終わりで確かめるため
  constraint list_sections_list_fkey
    foreign key (user_id, list_id) references public.lists (user_id, id) on delete no action,
  constraint list_sections_size_check check (length(id) <= 200 and length(name) <= 500)
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
  -- To-Do のタグ。記録では分類名を 1 つ写す（更新前の端末が先頭を分類として読むため。正は category）
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
  -- タスクごとの通知（null = 設定の既定、[] = 通知しない）
  reminders        jsonb,

  -- 記録（time log）
  is_time_log      boolean not null default false,
  is_sleep         boolean not null default false,  -- 睡眠。記録の時間・分類の集計から外す
  category         text,  -- 記録の分類（ラベル）名。null = ラベルなし
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
    on delete set null (section_id),
  constraint tasks_size_check check (
    length(id) <= 200 and length(title) <= 2000 and length(description) <= 200000
    and coalesce(length(location), 0) <= 2000 and pg_column_size(tags) <= 65536
    and coalesce(pg_column_size(recurrence), 0) <= 16384 and coalesce(pg_column_size(reminders), 0) <= 16384
  ),
  constraint tasks_category_size_check check (category is null or length(category) <= 200)
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
  primary key (user_id, id),
  constraint habits_size_check check (
    length(id) <= 200 and length(title) <= 2000 and pg_column_size(frequency) <= 16384
    and pg_column_size(completed_dates) <= 1048576
  )
);


-- ===========================================================================
-- user_settings（利用者ごとに 1 行。log_labels は記録のラベル（分類名と色）の並び）
-- ===========================================================================
create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  log_labels  jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint user_settings_size_check check (octet_length(log_labels::text) <= 20000)
);


-- ===========================================================================
-- push_subscriptions（Web Push の購読。1 端末 = 1 行）
-- Edge Function daily-reminders が pg_cron から呼ばれ、service_role で読む。
-- ===========================================================================
create table if not exists public.push_subscriptions (
  -- 送信はこの URL へサーバーから POST するので、ブラウザのプッシュサービスの URL だけにする
  -- （`supabase/functions/_shared/pushEndpoint.ts` と同じ形）
  endpoint               text primary key check (
    endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/'
  ),
  user_id                uuid not null references auth.users (id) on delete cascade,
  p256dh                 text not null,
  auth                   text not null,
  -- 端末の IANA タイムゾーン。通知時刻はこのタイムゾーンで判定する
  timezone               text not null default 'UTC',
  lang                   text not null default 'ja',

  -- 朝のまとめ（'HH:mm'、null = オフ）と、最後に送った日（1 日 1 回）
  plan_time              text check (plan_time is null or plan_time ~ '^\d{2}:\d{2}$'),
  last_plan_sent         date,
  -- 予定の開始 N 分前（null = オフ）
  event_reminder_minutes integer
    check (event_reminder_minutes is null or event_reminder_minutes between 1 and 120),
  -- 締切の通知・予定のあとの記録の確認
  due_reminders          boolean not null default false,
  record_prompts         boolean not null default false,
  -- 送った通知の鍵（同じ通知を二度送らない）
  reminder_sent          jsonb,
  -- タイマーの止め忘れ
  timer_started_at       timestamptz,
  timer_title            text,
  timer_notified_for     timestamptz,

  -- 使わなくなった列（夕方の締め・前の版の送った印）。古い版のアプリが送っても失敗しないよう残す
  wrap_up_time           text check (wrap_up_time is null or wrap_up_time ~ '^\d{2}:\d{2}$'),
  last_wrap_up_sent      date,
  event_notified         jsonb,
  due_notified           jsonb,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint push_subscriptions_size_check check (length(endpoint) <= 2000 and coalesce(length(timer_title), 0) <= 2000)
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);


-- ===========================================================================
-- google_oauth（Google カレンダーのリフレッシュトークン。サーバー専用）
-- トークンは enc:v1: で始まる暗号文（`supabase/functions/_shared/secretBox.ts`）
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
-- canvas_connection（Canvas LMS。学校（ホスト名）ごとに 1 行。サーバー専用）
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
-- edge_rate_limits（Edge Function の呼び出し回数。利用者ごと・機能ごと。サーバー専用）
-- 外のサービス（Google・Notion・学校の Canvas）へサーバーから送る回数を、1 人が際限なく増やせないようにする。
-- 時間の枠は固定（枠の始まりから p_window_seconds 秒）。数えるのは hit_rate_limit
-- ===========================================================================
create table if not exists public.edge_rate_limits (
  user_id      uuid not null references auth.users (id) on delete cascade,
  bucket       text not null,
  window_start timestamptz not null default now(),
  hits         integer not null default 0,
  primary key (user_id, bucket)
);

-- 1 回数え、枠の上限以内なら true（`supabase/functions/_shared/rateLimit.ts` が service_role で呼ぶ）
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


-- ===========================================================================
-- 古い書き込みを捨てる: サーバーの行より updated_at が古い更新は何もしない。
-- 取得から送信までの間に他の端末が直した行や、久しぶりに開いた端末の古い行で、新しい編集を上書きしないため。
-- 捨てた行は次の同期でサーバーの新しい版が届き、端末で項目ごとに合わせ直す
-- ===========================================================================
create or replace function public.skip_stale_write()
returns trigger
language plpgsql
as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['lists', 'list_sections', 'tasks', 'habits', 'user_settings'] loop
    execute format('drop trigger if exists skip_stale_write on public.%I', t);
    execute format('create trigger skip_stale_write before update on public.%I for each row execute function public.skip_stale_write()', t);
  end loop;
end $$;


-- ===========================================================================
-- RLS
-- ===========================================================================
alter table public.lists              enable row level security;
alter table public.list_sections      enable row level security;
alter table public.tasks              enable row level security;
alter table public.habits             enable row level security;
alter table public.user_settings      enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.google_oauth       enable row level security;  -- ポリシーなし（サーバー専用）
alter table public.notion_connection  enable row level security;  -- ポリシーなし（サーバー専用）
alter table public.canvas_connection  enable row level security;  -- ポリシーなし（サーバー専用）
alter table public.edge_rate_limits   enable row level security;  -- ポリシーなし（サーバー専用）

-- 本人の行だけ select / insert / update / delete できる（<表>_select_own など）
do $$
declare t text;
begin
  foreach t in array array['lists', 'list_sections', 'tasks', 'habits', 'user_settings', 'push_subscriptions'] loop
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


-- ===========================================================================
-- 前の版のスキーマの残りを消す（新しい DB では何もしない）
-- ===========================================================================
-- サーバー専用の表に残っていたブラウザ向けのポリシー
drop policy if exists google_oauth_delete_own on public.google_oauth;
drop policy if exists google_oauth_select_own on public.google_oauth;
drop policy if exists google_oauth_insert_own on public.google_oauth;
drop policy if exists google_oauth_update_own on public.google_oauth;
-- 主キー (user_id, ...) と上の索引で足りる、重なった索引
drop index if exists public.lists_user_id_idx;
drop index if exists public.list_sections_user_id_idx;
drop index if exists public.list_sections_list_id_idx;
drop index if exists public.tasks_user_id_idx;
drop index if exists public.tasks_list_id_idx;
drop index if exists public.tasks_section_id_idx;
drop index if exists public.habits_user_id_idx;
