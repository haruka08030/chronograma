-- Optional pinned flag for tasks (manual sort / TickTick-style pin)

alter table public.tasks
  add column if not exists pinned boolean not null default false;
