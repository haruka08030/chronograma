-- Allow fractional sort_order. Inserting a task between two others uses the midpoint (e.g. 62.5),
-- which an integer column rejects and stops the whole sync. Existing integer values convert as-is.
alter table public.lists alter column sort_order type double precision;
alter table public.list_sections alter column sort_order type double precision;
alter table public.tasks alter column sort_order type double precision;
