-- 022 の user_event_templates: よく入れる予定は利用者ごとに 1 行。版が合うときだけ書け（settings_write_guard）、本人だけが読める
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('public', 'user_event_templates', 'user_event_templates がある');
select has_trigger('public', 'user_event_templates', 'settings_write_guard', 'user_event_templates に settings_write_guard');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'templates-a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'templates-b@example.test');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

-- 初めて登録する（行が無いはず = -infinity）
insert into public.user_event_templates (user_id, templates, updated_at, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a',
  '[{"id":"t1","title":"早番","startTime":"09:00","endTime":"15:00","color":null}]', '1999-01-01T00:00:00Z', '-infinity')
on conflict (user_id) do update set templates = excluded.templates, base_updated_at = excluded.base_updated_at;
select is((select updated_at from public.user_event_templates), now(), '新しい行の updated_at はサーバーの時刻');
select is((select base_updated_at from public.user_event_templates), null, 'base_updated_at は行に残さない');

-- 別の端末が同じ時に「行が無いはず」で登録しても、先に入った行を上書きしない
insert into public.user_event_templates (user_id, templates, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', '[]', '-infinity')
on conflict (user_id) do update set templates = excluded.templates, base_updated_at = excluded.base_updated_at;
select is(jsonb_array_length((select templates from public.user_event_templates)), 1, '行があるのに -infinity をもとにした書き込みは捨てる');

-- 取得した版をもとに足す
select set_config('test.v1', (select updated_at::text from public.user_event_templates), true);
update public.user_event_templates
   set templates = templates || '[{"id":"t2","title":"遅番","startTime":"17:00","endTime":"22:00","color":"#039BE5"}]',
       base_updated_at = current_setting('test.v1')::timestamptz;
select is(jsonb_array_length((select templates from public.user_event_templates)), 2, '版が合う書き込みは通る');

-- 足す前の版をもとにした書き込み（古い画面）は捨てる
update public.user_event_templates set templates = '[]', base_updated_at = current_setting('test.v1')::timestamptz;
select is(jsonb_array_length((select templates from public.user_event_templates)), 2, '古い版をもとにした書き込みは捨てる');

-- 版なしの書き込み（下限より古い版のアプリ）は断る（017）
select throws_ok(
  $$update public.user_event_templates set templates = '[]', updated_at = '2999-01-01T00:00:00Z'$$,
  'P0001', null, '版なしの書き込みは断る');
-- 並びでない値は入れられない
select throws_ok(
  $$update public.user_event_templates set templates = '{}', base_updated_at = updated_at$$,
  '23514', null, 'templates は並び');
reset role;

-- B からは A の登録が見えない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.user_event_templates), 0, 'ほかの人のよく入れる予定は読めない');
reset role;

select * from finish();
rollback;
