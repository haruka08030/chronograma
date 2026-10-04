-- 1 人が持てる行数の上限。anon key は公開で誰でも登録できるので、1 アカウントから大量に書いて DB の容量を使い切れないようにする。
-- 上限は、毎日たくさん使う人が何年使っても届かない数にする:
--   tasks              200,000  タスク・予定・記録（タイマー・習慣の達成の記録も 1 行）。1 日 50 行を 10 年続けても約 18 万行
--   list_sections        5,000  リスト 1 つに数個〜十数個。リストの上限 1,000 の平均 5 個
--   lists                1,000  学期・授業・プロジェクトごとに作っても数百。アーカイブ・ゴミ箱の分も含む
--   habits               1,000  同時に続けるのは数個〜数十。アーカイブした分も残るので余裕を持たせる
--   push_subscriptions     100  1 端末・1 ブラウザに 1 行。購読し直しで増えた古い行（送信が失敗したら消える）を含めても数十
-- 利用者ごとに 1 行の表（user_settings・user_extra_time_zones・google_oauth・notion_connection）は主キーが user_id なので要らない。
-- サーバー専用の表（canvas_connection は Edge Function が 1 人 5 校まで、edge_rate_limits は機能ごとに 1 行）はブラウザから書けない。
--
-- 数えるのは「この文で新しく入った行」がある利用者だけ（文ごとに 1 回、AFTER INSERT の transition table）。
-- upsert（INSERT … ON CONFLICT DO UPDATE）で既にある行を更新した分は new_rows に入らないので、上限に達していても編集・同期は止まらない。
-- 超えたら文ごと取り消し、errcode P0001・メッセージ 'row_limit_exceeded'（detail に表と上限）を返す。
-- 呼び出した人の権限で数える（SECURITY DEFINER ではない）。RLS で本人の行だけが見え、本人の行しか入れられないので、数は本人の行数。
-- 数えるのは上限 + 1 行まで、主キー (user_id, …) / push_subscriptions_user_id_idx の索引で読む。
-- 同時に別々の文で足すと上限を少し超えうるが、容量を使い切らせないための上限なので問題ない。
-- 何度流しても同じ形になる。

create or replace function public.enforce_row_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cap bigint := tg_argv[0]::bigint;
  uid uuid;
  n bigint;
begin
  for uid in select distinct r.user_id from new_rows r loop
    execute format('select count(*) from (select 1 from %I.%I where user_id = $1 limit $2) s', tg_table_schema, tg_table_name)
      into n using uid, cap + 1;
    if n > cap then
      raise exception 'row_limit_exceeded'
        using errcode = 'P0001',
              detail = format('%s: at most %s rows per user', tg_table_name, cap),
              hint = 'Delete rows you no longer need.';
    end if;
  end loop;
  return null;
end;
$$;

do $$
declare
  t text;
  caps constant jsonb := '{"tasks": 200000, "list_sections": 5000, "lists": 1000, "habits": 1000, "push_subscriptions": 100}';
begin
  for t in select jsonb_object_keys(caps) loop
    execute format('drop trigger if exists enforce_row_limit on public.%I', t);
    execute format(
      'create trigger enforce_row_limit after insert on public.%I referencing new table as new_rows for each statement execute function public.enforce_row_limit(%L)',
      t, caps ->> t
    );
  end loop;
end $$;
