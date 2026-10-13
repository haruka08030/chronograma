-- app_config（017 の版の下限）を端末から書けないようにする（#367）。
-- - Supabase は public の表に anon / authenticated の書き込み権限を最初から付ける。017 は select を足しただけだったので、
--   端末からの update は権限で断られず、RLS で 0 行になって通っていた（書き換わりはしない）
-- - 書き込みの権限を外し、端末からの書き込みは権限のエラー（42501）にする（008・010 と同じ形）。下限を上げるのは SQL Editor から
-- 何度流しても同じ形になる。

revoke insert, update, delete, truncate on public.app_config from anon, authenticated;
