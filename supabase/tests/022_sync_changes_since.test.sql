-- 035 の sync_changes_since: 差分・消えた行の印・設定の版を 1 回で返す。本人の行だけ、authenticated だけが呼べる
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select has_function('public', 'sync_changes_since', array['timestamp with time zone', 'timestamp with time zone', 'integer'], 'sync_changes_since がある');
select ok(not has_function_privilege('anon', 'public.sync_changes_since(timestamptz, timestamptz, integer)', 'execute'), 'anon は呼べない');
select ok(has_function_privilege('authenticated', 'public.sync_changes_since(timestamptz, timestamptz, integer)', 'execute'), 'authenticated は呼べる');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000003a', 'changes-a@example.test'),
  ('00000000-0000-4000-8000-00000000003b', 'changes-b@example.test');
-- 古い行（差分に入らない）と、B の行
insert into public.lists (user_id, id, name, updated_at) values
  ('00000000-0000-4000-8000-00000000003a', 'old', 'Old', '2020-01-01T00:00:00Z'),
  ('00000000-0000-4000-8000-00000000003b', 'b-list', 'B', now());
insert into public.tasks (user_id, id, list_id, title, updated_at) values
  ('00000000-0000-4000-8000-00000000003a', 'old-task', 'old', 'old', '2020-01-01T00:00:00Z'),
  ('00000000-0000-4000-8000-00000000003b', 'b-task', 'b-list', 'secret', now());

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000003a","role":"authenticated"}', true);
set local role authenticated;

-- 何も変わっていなければ行も印も空。時刻・下限・設定の版は返る
select set_config('test.r', public.sync_changes_since(now() - interval '1 hour')::text, true);
select is(current_setting('test.r')::jsonb -> 'tasks', '[]'::jsonb, '変わっていなければ行は空（ほかの人の行は返さない）');
select is((current_setting('test.r')::jsonb ->> 'now')::timestamptz, now(), 'サーバーの時刻を返す');
select is(current_setting('test.r')::jsonb -> 'min_sync_version', (select value from public.app_config where key = 'min_sync_version'), '同期の取り決めの版の下限を返す');
select is(current_setting('test.r')::jsonb -> 'settings' -> 'user_settings', 'null'::jsonb, '設定の行が無ければ版は null');
select is(current_setting('test.r')::jsonb -> 'day_moods', 'null'::jsonb, '気分の目印を渡さなければ気分は返さない');
select is((current_setting('test.r')::jsonb ->> 'has_rows')::boolean, true, '本人の行があれば has_rows');

-- 書く・消す・設定を変える
insert into public.tasks (user_id, id, list_id, title, base_updated_at) values ('00000000-0000-4000-8000-00000000003a', 'new', 'old', 'new', '-infinity');
delete from public.tasks where id = 'old-task';
insert into public.user_settings (user_id, log_labels, base_updated_at) values ('00000000-0000-4000-8000-00000000003a', '[]', '-infinity');
insert into public.day_moods (user_id, day, mood, base_updated_at) values ('00000000-0000-4000-8000-00000000003a', '2026-10-13', 4, '-infinity');

select set_config('test.r', public.sync_changes_since(now() - interval '1 hour', now() - interval '1 hour')::text, true);
select is(
  (select array_agg(x ->> 'id') from jsonb_array_elements(current_setting('test.r')::jsonb -> 'tasks') x),
  array['new'],
  'p_since より後に変わった本人の行だけを返す');
select is(
  (select (x ->> 'updated_at')::timestamptz from jsonb_array_elements(current_setting('test.r')::jsonb -> 'tasks') x),
  (select updated_at from public.tasks where id = 'new'),
  '行は select * と同じ形（updated_at を含む）');
select is(
  (select array_agg(x ->> 'row_id') from jsonb_array_elements(current_setting('test.r')::jsonb -> 'tombstones') x),
  array['old-task'],
  '消えた行の印を返す');
select is(
  (current_setting('test.r')::jsonb -> 'settings' ->> 'user_settings')::timestamptz,
  (select updated_at from public.user_settings),
  '設定の行の版を返す');
select is((current_setting('test.r')::jsonb ->> 'tombstones_trimmed')::boolean, false, '上限で消した印が無ければ false');
select is(
  (select array_agg((x ->> 'day') || ':' || (x ->> 'mood')) from jsonb_array_elements(current_setting('test.r')::jsonb -> 'day_moods') x),
  array['2026-10-13:4'],
  '気分の目印より後に変わった日を返す');

-- 上限を超えた表は p_limit + 1 行まで（端末はページに分けた取得に切り替える）
insert into public.tasks (user_id, id, list_id, title, base_updated_at)
select '00000000-0000-4000-8000-00000000003a', 'many' || g, 'old', 'x', '-infinity' from generate_series(1, 5) g;
select is(
  jsonb_array_length(public.sync_changes_since(now() - interval '1 hour', null, 3) -> 'tasks'),
  4,
  '表ごとに p_limit + 1 行まで');

-- 行が 1 つも無い人（アカウントを消された・まだ何も送っていない）
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000003c","role":"authenticated"}', true);
select is((public.sync_changes_since('infinity') ->> 'has_rows')::boolean, false, '行が無ければ has_rows は false');

select * from finish();
rollback;
