-- 差分の取得（前回の取得より後に変わった行だけ）のための索引。lists / list_sections / tasks / habits を
-- user_id と updated_at の順で読む（where user_id = … and updated_at > … order by updated_at, id）。
-- 何度流しても同じ形になる。

create index if not exists lists_user_updated_idx         on public.lists (user_id, updated_at);
create index if not exists list_sections_user_updated_idx on public.list_sections (user_id, updated_at);
create index if not exists tasks_user_updated_idx         on public.tasks (user_id, updated_at);
create index if not exists habits_user_updated_idx        on public.habits (user_id, updated_at);
