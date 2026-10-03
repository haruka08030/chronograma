import type { Task } from '../types/task'

/**
 * 連携（Canvas・Notion）から取り込むタイトル・期限。前回取り込んだ値をこの端末で覚えておき、
 * ユーザーが手元で変えた値を連携の値で上書きしないために使う
 */
export type PulledFields = { title: string; dueDate: string | null; dueTime: string | null }

function sameDue(a: { dueDate: string | null; dueTime: string | null }, b: { dueDate: string | null; dueTime: string | null }) {
  return a.dueDate === b.dueDate && a.dueTime === b.dueTime
}

/**
 * 連携の値のうち、手元のタスクに当てるもの。
 * - `prev`（前回取り込んだ値）を渡すと、「前回から連携の側で変わった」かつ「手元はユーザーが変えていない」項目だけ当てる
 * - 前回の値が分からない（`remember` だが `prev` が無い）ときは当てない（ユーザーが変えていたかもしれない）
 * - `remember` が false なら前の動き（いつも連携の値に合わせる）
 */
export function externalPatch(
  existing: Pick<Task, 'title' | 'dueDate' | 'dueTime'>,
  incoming: PulledFields,
  prev: PulledFields | undefined,
  { remember, due = true }: { remember: boolean; due?: boolean },
): Partial<Task> {
  const localDue = { dueDate: existing.dueDate, dueTime: existing.dueTime ?? null }
  const applyTitle = !remember || (prev !== undefined && prev.title !== incoming.title && existing.title === prev.title)
  const applyDue = !remember || (prev !== undefined && !sameDue(prev, incoming) && sameDue(localDue, prev))
  const patch: Partial<Task> = {}
  if (existing.title !== incoming.title && applyTitle) patch.title = incoming.title
  if (due && !sameDue(localDue, incoming) && applyDue) {
    patch.dueDate = incoming.dueDate
    patch.dueTime = incoming.dueTime
  }
  return patch
}

/** 前回取り込んだ値を、この端末に覚えておく（連携ごと・人ごと） */
export function loadPulled(key: string): Record<string, PulledFields> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, PulledFields>
  } catch {
    return {}
  }
}

export function savePulled(key: string, pulled: Record<string, PulledFields>) {
  try {
    localStorage.setItem(key, JSON.stringify(pulled))
  } catch {
    /* 覚えられなければ、次は前回の値が分からない扱い（上書きしない）になるだけ */
  }
}
