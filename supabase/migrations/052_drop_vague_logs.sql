-- 「なんとなく」をやめる。記録の無い時間は何もしなくてもふりかえりの棒に斜線で積まれるので、手で選ぶ意味がない。
-- - 「なんとなく」の記録はゴミ箱に入れて記録の無い時間に戻し、印を下ろす（ゴミ箱から戻せばふつうの記録）
-- - 動いているタイマーの印も消す
-- 前の版のアプリが is_vague・vague_for を送るので、列は消さない。

update public.tasks
set is_vague = false,
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
where is_vague;

update public.user_active_timer
set vague_for = null
where vague_for is not null;
