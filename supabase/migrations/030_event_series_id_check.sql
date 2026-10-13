-- 027 の tasks_event_series_check を、id の無い印を断るように作り直す（#367）。
-- - 027 の `jsonb_typeof(event_series -> 'id') = 'string'` は id が無いと NULL になり、CHECK は NULL を通すので、
--   `{"weekdays":[1]}` のような id の無い印が入っていた。coalesce で false にする
-- - 形と大きさの条件はほかは 027 と同じ（id のある object、2048 バイトまで）
-- 何度流しても同じ形になる。

alter table public.tasks drop constraint if exists tasks_event_series_check;
alter table public.tasks add constraint tasks_event_series_check
  check (
    event_series is null
    or (jsonb_typeof(event_series) = 'object'
        and coalesce(jsonb_typeof(event_series -> 'id') = 'string', false)
        and octet_length(event_series::text) <= 2048)
  );
