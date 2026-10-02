-- Per-task time zone (like a Google Calendar event's time zone).
-- time_zone: the IANA zone the task was entered in (null = follows the app's time zone).
-- time_zone_anchor: the zone the date/time columns are written in; each device rewrites them
-- to its own app time zone on load (same instant), so they stay correct across devices.
-- Run after 001_chronograma_schema.sql.
alter table public.tasks
  add column if not exists time_zone text,
  add column if not exists time_zone_anchor text;
