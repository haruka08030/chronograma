-- Link a record (time log) to the habit it was made from.
-- Habits with a set time judge "on time" from this record's start/end. NULL means not from a habit.
-- No foreign key: deleting a habit should not touch its past records. Run after 001_chronograma_schema.sql.
alter table public.tasks
  add column if not exists habit_id text;
