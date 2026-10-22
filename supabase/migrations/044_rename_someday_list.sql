-- 最初から作るいつかのリストの名前を「やりたいこと」/ Bucket list にした（#517・#526）。
--
-- - 種類がいつか（kind = 'someday'）で、名前が前の初期の名前そのまま（いつか / Someday）のリストだけを同じ言語の今の名前にする。自分で付けた名前は変えない
-- - アプリも保存データの版 43 で同じ規則で直す。updated_at を進めて、差分で取る端末にも届ける
--
-- 何度流しても同じ形になる（直すのは前の名前のものだけ）。

update public.lists
set name = case name when 'いつか' then 'やりたいこと' else 'Bucket list' end,
    updated_at = now()
where kind = 'someday'
  and name in ('いつか', 'Someday');
