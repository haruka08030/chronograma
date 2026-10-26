-- 習慣の種類（habits.kind）。'habit' は習慣（続けたいこと）、'routine' はルーティン（毎日の予定のプリセット。達成を数えない）。
-- 列を含まない古いアプリの insert は 'habit'、upsert の update は列に触れないので消えない
-- 何度流しても同じ形になる。
alter table public.habits add column if not exists kind text not null default 'habit';

alter table public.habits drop constraint if exists habits_kind_check;
alter table public.habits add constraint habits_kind_check check (kind in ('habit', 'routine'));
