-- リストを消したときに、中のタスク・セクションをサーバー側で道連れにしない。
--
-- 以前は on delete cascade だったので、端末 A がリスト L を消すのと同じころに端末 B が L にタスクを足すと、
-- A の削除で B のタスクがサーバーから消え、B も次の同期でそれを「消された」と読んで手元から消していた。
-- no action にすると、そのときは A のリスト削除が失敗し、次の同期で B のタスクを受け取って未分類へ移してから消し直す。
-- （restrict ではなく no action にするのは、アカウントの削除で auth.users から lists と tasks の両方へ
--   cascade するときに、文の終わりで確かめるため）
-- 何度流しても同じ形になる。

alter table public.tasks drop constraint if exists tasks_list_fkey;
alter table public.tasks
  add constraint tasks_list_fkey
  foreign key (user_id, list_id) references public.lists (user_id, id) on delete no action;

alter table public.list_sections drop constraint if exists list_sections_list_fkey;
alter table public.list_sections
  add constraint list_sections_list_fkey
  foreign key (user_id, list_id) references public.lists (user_id, id) on delete no action;
