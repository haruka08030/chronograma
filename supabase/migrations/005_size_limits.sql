-- ===========================================================================
-- 大きさの上限。1 人のアカウントに巨大な行を書き込めないようにする。
-- ふつうの使い方では届かない大きさにしてあり、アプリも送る前に同じ長さで切る（`supabaseData.ts`）。
-- 既にある行は検査しない（not valid）。何度流しても同じ形になる。
-- ===========================================================================
do $$
declare c record;
begin
  for c in
    select * from (values
      ('lists',              'lists_size_check',              'length(id) <= 200 and length(name) <= 500'),
      ('list_sections',      'list_sections_size_check',      'length(id) <= 200 and length(name) <= 500'),
      ('tasks',              'tasks_size_check',
        'length(id) <= 200 and length(title) <= 2000 and length(description) <= 200000'
        || ' and coalesce(length(location), 0) <= 2000 and pg_column_size(tags) <= 65536'
        || ' and coalesce(pg_column_size(recurrence), 0) <= 16384 and coalesce(pg_column_size(reminders), 0) <= 16384'),
      ('habits',             'habits_size_check',
        'length(id) <= 200 and length(title) <= 2000 and pg_column_size(frequency) <= 16384'
        || ' and pg_column_size(completed_dates) <= 1048576'),
      ('push_subscriptions', 'push_subscriptions_size_check',
        'length(endpoint) <= 2000 and coalesce(length(timer_title), 0) <= 2000')
    ) as v(tbl, name, expr)
  loop
    execute format('alter table public.%I drop constraint if exists %I', c.tbl, c.name);
    execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.name, c.expr);
  end loop;
end $$;
