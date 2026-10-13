/** よく入れる予定（バイトのシフトなど、#311）の登録と、月表示で日を押して入れる・外す */
import { normalizeEventTemplates, templateEventOnDay } from '../../lib/eventTemplates'
import { sameValue } from '../../lib/sameValue'
import { INBOX_ID } from '../storeConstants'
import { makeTask, orderForNewSiblingAtFront } from '../taskHelpers'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'

type EventTemplateActions = Pick<TaskState, 'saveEventTemplates' | 'toggleEventTemplateDay'>

export function createEventTemplatesSlice({ set, get, undo }: SliceContext): EventTemplateActions {
  const { pushUndo } = undo
  return {
    saveEventTemplates: (templates) => {
      const next = normalizeEventTemplates(templates)
      // 同じ中身なら時刻を付けない（同期で送り直さない）
      if (sameValue(next, get().eventTemplates)) return
      set({ eventTemplates: next })
    },

    toggleEventTemplateDay: (templateId, dateKey, sessionTaskIds) => {
      const s = get()
      const template = s.eventTemplates.find((t) => t.id === templateId)
      if (!template) return null
      const existing = templateEventOnDay(s.tasks, template, dateKey)
      if (existing) {
        pushUndo()
        // この続けて押している間に入れたもの（押し間違いを直した）はゴミ箱に残さない。前からあったものはゴミ箱へ
        if (sessionTaskIds?.has(existing.id)) {
          set((st) => ({ tasks: st.tasks.filter((t) => t.id !== existing.id) }))
        } else {
          const nowIso = new Date().toISOString()
          set((st) => ({ tasks: st.tasks.map((t) => (t.id === existing.id ? { ...t, deletedAt: nowIso, updatedAt: nowIso } : t)) }))
        }
        return { kind: 'removed', taskId: existing.id }
      }
      // ふつうの予定と同じ（未分類に入る。予定のあとの確認・記録・統計も同じ）
      const task = makeTask(
        {
          title: template.title,
          listId: INBOX_ID,
          scheduledDate: dateKey,
          startTime: template.startTime,
          endTime: template.endTime,
          kind: 'event',
          color: template.color,
        },
        orderForNewSiblingAtFront(s.tasks, INBOX_ID, null),
      )
      pushUndo()
      set((st) => ({ tasks: [...st.tasks, task] }))
      return { kind: 'added', taskId: task.id }
    },
  }
}
