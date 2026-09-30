-- Per-record color (e.g. a record copied from a Google Calendar event keeps that event's color).
-- NULL means "use the log category's color". Run after 001_chronograma_schema.sql.
alter table public.tasks
  add column if not exists color text
    check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');
