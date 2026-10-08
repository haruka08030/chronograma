-- 端末のエラーの記録 `client_errors`（`011`）の種類に、黙って続けていた失敗の 3 つを足す。
-- - storage: 端末の保存（本体の保存・読み込み・自動バックアップ）の失敗
-- - integration: 連携（Canvas・Notion・Google カレンダー）の取り込み・書き戻しの失敗
-- - push: Web Push の購読・購読の保存・購読の削除の失敗
-- どこで失敗したかは `extra->>'stage'`。送るのは `src/lib/errorReport.ts` の `reportFailure`。
-- 何度流しても同じ形になる。

alter table public.client_errors drop constraint if exists client_errors_kind_check;
alter table public.client_errors add constraint client_errors_kind_check
  check (kind in ('render', 'error', 'unhandledrejection', 'sync', 'chunk', 'storage', 'integration', 'push'));
