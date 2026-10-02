-- 主キーを利用者ごとにする（lists / list_sections / tasks / habits）。
-- これまで主キーは id だけで、全利用者で共通だった。未分類は全員 '__inbox__'、Notion のリストは
-- 全員 'notion-list' なので、2 人目以降の同期は最初の利用者の行とぶつかって RLS に弾かれ、
-- リストの送信で止まってタスクが一切クラウドに届かなかった。
-- 主キーを (user_id, id) にし、外部キーも同じ利用者の行だけを指すようにする
-- （他人のリストを list_id に指定できる穴も同時にふさぐ）。
-- アプリは onConflict 'user_id,id' で送る（未適用の DB では 'id' に戻して送る）。
-- 必要: Postgres 15 以上（ON DELETE SET NULL (列) のため。Supabase は 15 以上）。
-- 再実行しても安全。Run after 001.

-- 1) lists / list_sections を指す外部キーをいったん外す（名前は環境で違うことがあるので探して消す）
do $$
declare r record;
begin
  for r in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where con.contype = 'f'
      and ns.nspname = 'public'
      and con.confrelid in ('public.lists'::regclass, 'public.list_sections'::regclass)
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
  end loop;
end $$;

-- 2) 主キーを (user_id, id) に張り替える
do $$
declare
  t text;
  pk text;
begin
  foreach t in array array['lists', 'list_sections', 'tasks', 'habits'] loop
    select con.conname into pk
    from pg_constraint con
    where con.conrelid = format('public.%I', t)::regclass and con.contype = 'p';
    if pk is not null then
      execute format('alter table public.%I drop constraint %I', t, pk);
    end if;
    execute format('alter table public.%I add constraint %I primary key (user_id, id)', t, t || '_pkey');
  end loop;
end $$;

-- 3) 外部キーを同じ利用者の行に限って張り直す
alter table public.list_sections
  add constraint list_sections_list_fkey
  foreign key (user_id, list_id) references public.lists (user_id, id) on delete cascade;

alter table public.tasks
  add constraint tasks_list_fkey
  foreign key (user_id, list_id) references public.lists (user_id, id) on delete cascade;

-- セクションが消えたら section_id だけ null にする（user_id は残す）
alter table public.tasks
  add constraint tasks_section_fkey
  foreign key (user_id, section_id) references public.list_sections (user_id, id)
  on delete set null (section_id);

-- 外部キーの検索用（(user_id, ...) の主キーが user_id 単独の検索も兼ねる）
create index if not exists tasks_user_list_idx on public.tasks (user_id, list_id);
create index if not exists tasks_user_section_idx on public.tasks (user_id, section_id);
create index if not exists list_sections_user_list_idx on public.list_sections (user_id, list_id);
