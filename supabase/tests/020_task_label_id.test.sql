-- 033: tasks.label_id（ラベルの id、#365）。前の版のアプリが名前・色を変えたら外れ、埋め戻しは名前・色から付ける
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_column('public', 'tasks', 'label_id', 'tasks に label_id がある');
select has_column('public', 'tasks', 'label_id_sent', 'tasks に label_id_sent がある');
select has_trigger('public', 'tasks', 'tasks_label_id_guard', 'tasks に tasks_label_id_guard');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000a', 'label-a@example.test');
insert into public.lists (user_id, id, name, updated_at)
values ('00000000-0000-4000-8000-00000000000a', '__inbox__', '未分類', '2020-01-01T00:00:00Z');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

-- この版のアプリ: id と名前を送る。印は行に残らない
insert into public.tasks (user_id, id, list_id, title, is_time_log, category, tags, label_id, label_id_sent, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', 'r1', '__inbox__', '線形代数', true, '数学', '["数学"]',
  '11111111-1111-4111-8111-111111111111', true, '-infinity');
select is((select label_id::text from public.tasks where id = 'r1'), '11111111-1111-4111-8111-111111111111', 'label_id を書ける');
select is((select label_id_sent from public.tasks where id = 'r1'), null, '印は行に残らない');

-- この版のアプリが upsert で名前を直す（同じ id）: id は残る
select set_config('test.v1', (select updated_at::text from public.tasks where id = 'r1'), true);
insert into public.tasks (user_id, id, list_id, title, is_time_log, category, tags, label_id, label_id_sent, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', 'r1', '__inbox__', '線形代数', true, '数学II', '["数学II"]',
  '11111111-1111-4111-8111-111111111111', true, current_setting('test.v1')::timestamptz)
on conflict (user_id, id) do update set category = excluded.category, tags = excluded.tags, label_id = excluded.label_id,
  label_id_sent = excluded.label_id_sent, base_updated_at = excluded.base_updated_at;
select is((select label_id::text from public.tasks where id = 'r1'), '11111111-1111-4111-8111-111111111111', 'この版のアプリの書き込みでは id が残る');

-- 前の版のアプリ（label_id を送らない）が題名だけ直す: id は残る
select set_config('test.v2', (select updated_at::text from public.tasks where id = 'r1'), true);
insert into public.tasks (user_id, id, list_id, title, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', 'r1', '__inbox__', '線形代数 2 章', current_setting('test.v2')::timestamptz)
on conflict (user_id, id) do update set title = excluded.title, base_updated_at = excluded.base_updated_at;
select is((select label_id::text from public.tasks where id = 'r1'), '11111111-1111-4111-8111-111111111111', '前の版が名前・色を変えなければ id は残る');

-- 前の版のアプリが分類を変える: id は外れる（アプリは名前から付け直す）
select set_config('test.v3', (select updated_at::text from public.tasks where id = 'r1'), true);
insert into public.tasks (user_id, id, list_id, title, category, tags, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', 'r1', '__inbox__', '線形代数 2 章', '英語', '["英語"]', current_setting('test.v3')::timestamptz)
on conflict (user_id, id) do update set category = excluded.category, tags = excluded.tags, base_updated_at = excluded.base_updated_at;
select is((select label_id from public.tasks where id = 'r1'), null, '前の版が分類を変えたら id は外れる');

-- 前の版のアプリが To-Do の色を変える: id は外れる
insert into public.tasks (user_id, id, list_id, title, color, label_id, label_id_sent, base_updated_at)
values ('00000000-0000-4000-8000-00000000000a', 't1', '__inbox__', 'ES', '#039BE5',
  '22222222-2222-4222-8222-222222222222', true, '-infinity');
update public.tasks set color = '#D50000', base_updated_at = updated_at where id = 't1';
select is((select label_id from public.tasks where id = 't1'), null, '前の版が色を変えたら id は外れる');
reset role;

-- 埋め戻し（migration と同じ SQL を流し直す）: id の無いラベルに名前から決まる id、行は名前・色から
insert into public.user_settings (user_id, log_labels, updated_at)
values ('00000000-0000-4000-8000-00000000000a', '[{"name":"英語","color":"sage"},{"name":"就活","color":"#d50000"}]', '2026-01-01T00:00:00Z')
on conflict (user_id) do update set log_labels = excluded.log_labels;
update public.user_settings s
   set log_labels = (
     select jsonb_agg(case when l.value ? 'id' then l.value
       else l.value || jsonb_build_object('id', md5('chronograma-label:' || (l.value ->> 'name'))::uuid::text) end order by l.ordinality)
     from jsonb_array_elements(s.log_labels) with ordinality l)
 where user_id = '00000000-0000-4000-8000-00000000000a';
select is(
  (select log_labels -> 0 ->> 'id' from public.user_settings where user_id = '00000000-0000-4000-8000-00000000000a'),
  md5('chronograma-label:英語')::uuid::text,
  'ラベルの id は名前から決まる（アプリの legacyLabelId と同じ）');
select is(md5('chronograma-label:授業')::uuid::text, '96c4810d-5f65-f512-4cc6-339e5fbcf9ff', 'アプリの md5 と同じ値（src/lib/md5.test.ts）');

update public.tasks t set label_id = (l.value ->> 'id')::uuid
  from public.user_settings s cross join lateral jsonb_array_elements(s.log_labels) l
 where t.user_id = s.user_id and t.label_id is null and t.is_time_log and t.category = l.value ->> 'name';
update public.tasks t set label_id = (l.value ->> 'id')::uuid
  from public.user_settings s cross join lateral jsonb_array_elements(s.log_labels) l
 where t.user_id = s.user_id and t.label_id is null and not t.is_time_log and upper(t.color) = upper(l.value ->> 'color');
select is(
  (select array[(select label_id::text from public.tasks where id = 'r1'), (select label_id::text from public.tasks where id = 't1')]),
  array[md5('chronograma-label:英語')::uuid::text, md5('chronograma-label:就活')::uuid::text],
  '埋め戻しで記録は分類名、To-Do は色から id が付く');

select * from finish();
rollback;
