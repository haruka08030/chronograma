-- 025 の day_moods: 1 日の気分とひとことは利用者ごと・日ごとに 1 行。版が合うときだけ書け（day_mood_write_guard）、本人だけが読める
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_table('public', 'day_moods', 'day_moods がある');
select has_trigger('public', 'day_moods', 'day_mood_write_guard', 'day_moods に day_mood_write_guard');
select has_trigger('public', 'day_moods', 'enforce_row_limit', 'day_moods に enforce_row_limit');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'mood-a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'mood-b@example.test');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

-- 初めて選ぶ（行が無いはず = -infinity）
insert into public.day_moods (user_id, day, mood, note, updated_at, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', '2026-10-08', 4, '', '1999-01-01T00:00:00Z', '-infinity')
on conflict (user_id, day) do update set mood = excluded.mood, note = excluded.note, base_updated_at = excluded.base_updated_at;
select is((select updated_at from public.day_moods where day = '2026-10-08'), now(), '新しい行の updated_at はサーバーの時刻');
select is((select base_updated_at from public.day_moods where day = '2026-10-08'), null, 'base_updated_at は行に残さない');

-- 別の端末が同じ日に「行が無いはず」で選んでも、先に入った行を上書きしない
insert into public.day_moods (user_id, day, mood, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', '2026-10-08', 1, '-infinity')
on conflict (user_id, day) do update set mood = excluded.mood, base_updated_at = excluded.base_updated_at;
select is((select mood from public.day_moods where day = '2026-10-08'), 4::smallint, '行があるのに -infinity をもとにした書き込みは捨てる');

-- 取得した版をもとに一言を足す
select set_config('test.v1', (select updated_at::text from public.day_moods where day = '2026-10-08'), true);
update public.day_moods set note = 'よく寝た', base_updated_at = current_setting('test.v1')::timestamptz where day = '2026-10-08';
select is((select note from public.day_moods where day = '2026-10-08'), 'よく寝た', '版が合う書き込みは通る');

-- 足す前の版をもとにした書き込み（古い画面）は捨てる
update public.day_moods set mood = null, base_updated_at = current_setting('test.v1')::timestamptz where day = '2026-10-08';
select is((select mood from public.day_moods where day = '2026-10-08'), 4::smallint, '古い版をもとにした書き込みは捨てる');

-- 別の日は別の行
insert into public.day_moods (user_id, day, mood, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', '2026-10-07', 2, '-infinity');
select is((select count(*)::int from public.day_moods), 2, '日ごとに 1 行');

-- 版なしの書き込み（下限より古い版のアプリ）は断る（017 と同じ）
select throws_ok(
  $$update public.day_moods set mood = 5, updated_at = '2999-01-01T00:00:00Z' where day = '2026-10-08'$$,
  'P0001', null, '版なしの書き込みは断る');
-- 範囲の外の値は入れられない
select throws_ok(
  $$update public.day_moods set mood = 6, base_updated_at = updated_at where day = '2026-10-08'$$,
  '23514', null, '気分は 1〜5');
select throws_ok(
  $$update public.day_moods set note = repeat('あ', 501), base_updated_at = updated_at where day = '2026-10-08'$$,
  '23514', null, 'ひとことの長さの上限');
-- ほかの人の行としては入れられない
select throws_ok(
  $$insert into public.day_moods (user_id, day, mood, base_updated_at)
    values ('00000000-0000-4000-8000-00000000000b', '2026-10-08', 3, '-infinity')$$,
  '42501', null, 'ほかの人の気分は書けない');
reset role;

-- B からは A の気分が見えない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.day_moods), 0, 'ほかの人の気分は読めない');
reset role;

select * from finish();
rollback;
