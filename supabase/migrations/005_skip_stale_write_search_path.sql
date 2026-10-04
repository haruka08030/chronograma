-- 001 の古い書き込みを捨てるトリガー関数 skip_stale_write の search_path を固定する。
-- 本体は new / old しか使わないので、空にしても動きは変わらない（呼び出し元の search_path で別の関数・表に化けさせない）。
-- 何度流しても同じ形になる。

alter function public.skip_stale_write() set search_path = '';
