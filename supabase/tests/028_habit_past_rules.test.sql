-- 047 の habits.past_rules: 列があり、並び（array）でなければ入らず、列を送らない前の版のアプリの upsert では消えない
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select has_column('public', 'habits', 'past_rules', 'habits に past_rules');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000b', 'habit-past@example.test');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;

insert into public.habits (user_id, id, title, past_rules, base_updated_at)
values ('00000000-0000-4000-8000-00000000000b', 'walk', '散歩', '[{"until":"2026-10-24","off":true}]', '-infinity');
select is((select past_rules from public.habits where id = 'walk'), '[{"until":"2026-10-24","off":true}]'::jsonb, '前の日の設定が入る');

select set_config('test.v1', (select updated_at::text from public.habits where id = 'walk'), true);
insert into public.habits (user_id, id, title, base_updated_at)
values ('00000000-0000-4000-8000-00000000000b', 'walk', '朝の散歩', current_setting('test.v1')::timestamptz)
on conflict (user_id, id) do update set title = excluded.title, base_updated_at = excluded.base_updated_at;
select is((select past_rules is not null from public.habits where id = 'walk'), true, '列を送らない upsert では消えない');

select throws_ok(
  $$update public.habits set past_rules = '{"until":"2026-10-24"}', base_updated_at = updated_at where id = 'walk'$$,
  '23514', null, '前の日の設定は並び（array）だけ');

select * from finish();
rollback;
