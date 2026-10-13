import { useCallback, useMemo, useRef, useState } from 'react'
import { useTaskStore } from '../store/taskStore'
import { templateDays, type EventTemplate } from '../lib/eventTemplates'
import type { ToastText } from '../store/storeTypes'
import { newId } from '../lib/id'

/** 入れた日・外した日の数のトーストの文 */
export function stampToastText(title: string, added: number, removed: number): ToastText | null {
  if (added > 0 && removed > 0) return { key: 'eventTemplates.changedToast', params: { title, added, removed } }
  if (added > 0) return { key: 'eventTemplates.addedToast', params: { title, count: added } }
  if (removed > 0) return { key: 'eventTemplates.removedToast', params: { title, count: removed } }
  return null
}

/**
 * 月表示で「よく入れる予定」を選んでから日を続けて押す間（#311）。
 * - 押すたびにその日に入れる・外す（`toggleEventTemplateDay`）。続けて押した分は 1 回の取り消しで戻る（`asUndoSession`）
 * - トーストには入れた日の数を出し、そこからまとめて取り消せる
 */
export function useEventTemplateStamp() {
  const templates = useTaskStore((s) => s.eventTemplates)
  const tasks = useTaskStore((s) => s.tasks)
  const [active, setActive] = useState<{ templateId: string; session: string } | null>(null)
  /** この間に入れた予定（押し間違いを外すときはゴミ箱に残さない） */
  const createdRef = useRef(new Set<string>())
  /** この間にゴミ箱へ入れた、前からあった予定 */
  const removedRef = useRef(new Set<string>())

  // 登録を消した・同期で消えたら抜ける
  const template: EventTemplate | null = active ? (templates.find((t) => t.id === active.templateId) ?? null) : null
  const days = useMemo(() => (template ? templateDays(tasks, template) : new Set<string>()), [tasks, template])

  const start = useCallback((templateId: string) => {
    createdRef.current = new Set()
    removedRef.current = new Set()
    setActive({ templateId, session: `event-template:${templateId}:${newId()}` })
  }, [])

  const stop = useCallback(() => setActive(null), [])

  const toggleDay = useCallback(
    (dateKey: string) => {
      if (!active) return
      const s = useTaskStore.getState()
      const tpl = s.eventTemplates.find((t) => t.id === active.templateId)
      if (!tpl) return
      let result: ReturnType<typeof s.toggleEventTemplateDay> = null
      s.asUndoSession(active.session, () => {
        result = s.toggleEventTemplateDay(active.templateId, dateKey, createdRef.current)
      })
      const r = result as ReturnType<typeof s.toggleEventTemplateDay>
      if (!r) return
      if (r.kind === 'added') createdRef.current.add(r.taskId)
      else if (!createdRef.current.delete(r.taskId)) removedRef.current.add(r.taskId)
      // 数えるのは今の中身から（途中でトーストから取り消しても数が合う）
      const now = useTaskStore.getState().tasks
      const byId = new Map(now.map((t) => [t.id, t]))
      const added = [...createdRef.current].filter((id) => byId.has(id) && !byId.get(id)!.deletedAt).length
      const removed = [...removedRef.current].filter((id) => byId.get(id)?.deletedAt).length
      const text = stampToastText(tpl.title, added, removed)
      useTaskStore.setState({ undoBanner: text ? { text, at: Date.now() } : null })
    },
    [active],
  )

  return { template, days, start, stop, toggleDay, activeId: template?.id ?? null }
}
