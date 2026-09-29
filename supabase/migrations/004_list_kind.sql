-- List kinds: separate real tasks from someday wishes and checklists (shopping etc.).
-- Run after 001_chronograma_schema.sql. Existing lists become 'tasks'.
--   tasks     : deadline / scheduled to-dos (default)
--   someday   : wishes; kept out of Today / due views, stats and reminders
--   checklist : shopping / packing lists; kept out of planning, stats and reminders

alter table public.lists
  add column if not exists kind text not null default 'tasks';

alter table public.lists drop constraint if exists lists_kind_check;
alter table public.lists
  add constraint lists_kind_check check (kind in ('tasks', 'someday', 'checklist'));
