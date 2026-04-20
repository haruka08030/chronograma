import type { Task } from '../types/task'

/** 一覧でタイムログ（isTimeLog）扱いにする（camelCase / 旧 snake_case の両方を許容） */
export function isListedTimeLog(t: Task): boolean {
  const raw = t as Task & { is_time_log?: boolean }
  return raw.isTimeLog === true || raw.is_time_log === true
}
