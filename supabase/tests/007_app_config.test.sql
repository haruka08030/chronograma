-- 017 の app_config: 同期の取り決めの版の下限を、ログイン前でもログイン後でも読める（書けない）
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select ok((select (value)::int >= 1 from public.app_config where key = 'min_sync_version'), '下限の行がある');

set local role authenticated;
select ok((select count(*) = 1 from public.app_config where key = 'min_sync_version'), 'ログインした人が読める');
select throws_ok($$update public.app_config set value = '99' where key = 'min_sync_version'$$, '42501', null, 'アプリからは書けない');
reset role;

select * from finish();
rollback;
