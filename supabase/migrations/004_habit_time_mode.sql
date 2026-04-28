alter table public.habits
add column if not exists time_mode text not null default 'none';

update public.habits
set time_mode = case
  when start_time is not null and end_time is not null then 'range'
  when start_time is not null and end_time is null then 'fixed'
  else 'none'
end
where time_mode not in ('none', 'fixed', 'range');

update public.habits
set time_mode = case
  when start_time is not null and end_time is not null then 'range'
  when start_time is not null and end_time is null then 'fixed'
  else 'none'
end
where time_mode is null;

alter table public.habits
drop constraint if exists habits_time_mode_check;

alter table public.habits
add constraint habits_time_mode_check
check (time_mode in ('none', 'fixed', 'range'));
