-- 古い書き込みを弾く: サーバーにある行より updated_at が古い更新は、何もせずに捨てる。
-- 取得から送信までの間に他の端末が直した行や、久しぶりに開いた端末の古い行で、新しい編集を上書きしないため。
-- 捨てた行は次の同期でサーバーの新しい版が届き、端末で項目ごとに合わせ直す（クライアントの変更は要らない）。
-- 何度流しても同じ形になる。

create or replace function public.skip_stale_write()
returns trigger
language plpgsql
as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists skip_stale_write on public.lists;
create trigger skip_stale_write before update on public.lists
  for each row execute function public.skip_stale_write();

drop trigger if exists skip_stale_write on public.list_sections;
create trigger skip_stale_write before update on public.list_sections
  for each row execute function public.skip_stale_write();

drop trigger if exists skip_stale_write on public.tasks;
create trigger skip_stale_write before update on public.tasks
  for each row execute function public.skip_stale_write();

drop trigger if exists skip_stale_write on public.habits;
create trigger skip_stale_write before update on public.habits
  for each row execute function public.skip_stale_write();
