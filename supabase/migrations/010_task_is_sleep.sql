-- Mark a record (time log) as sleep. Sleep is entered in the morning as "went to bed / woke up",
-- drawn as a quiet band on the timeline, and left out of the logged-time and category totals.
-- Run after 001_chronograma_schema.sql.
alter table public.tasks
  add column if not exists is_sleep boolean not null default false;
