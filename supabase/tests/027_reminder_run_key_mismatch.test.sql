-- 046 の reminder_runs.last_key_mismatch: 鍵が合わずに消した購読の数（読めない・書けないのは 006_server_only）
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select has_column('public', 'reminder_runs', 'last_key_mismatch', 'reminder_runs に last_key_mismatch');
select col_type_is('public', 'reminder_runs', 'last_key_mismatch', 'integer', 'last_key_mismatch は integer');

select * from finish();
rollback;
