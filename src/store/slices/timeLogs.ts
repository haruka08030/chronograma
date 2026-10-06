/** 記録（時間ログ）・タイマー・睡眠 */
import i18n from '../../i18n/config'
import { logLabelFromTask } from '../../lib/logCategoryColors'
import { timerRecordTimes } from '../../lib/timerRecord'
import { taskPlacementDate } from '../../lib/taskTimeRange'
import { sleepEndingOn, sleepSpan } from '../../lib/sleep'
import { zonedNow } from '../../lib/timeZone'
import { INBOX_ID } from '../storeConstants'
import { logColorNames, withInferredCategory } from '../storeDefaults'
import { completedRecordPatch, makeTask } from '../taskHelpers'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'
import { toDateKey } from '../../lib/dateKey'
import { clockOf } from '../../lib/clockTime'
import { isLogTask } from '../../types/task'

type TimeLogsActions = Pick<
  TaskState,
  | 'addCompletedTaskWithTime'
  | 'addTimeLog'
  | 'logSleep'
  | 'startTimer'
  | 'resolveStaleTimer'
  | 'discardActiveTimer'
  | 'dismissCompletePrompt'
  | 'dismissLabelPrompt'
  | 'stopTimer'
  | 'openRecordPrompt'
  | 'logPlanAsPlanned'
>

export function createTimeLogsSlice({ set, get, undo }: SliceContext): TimeLogsActions {
  const { pushUndo } = undo
  return {
    addCompletedTaskWithTime: (title, dueDate, startTime, endTime, color) => {
      pushUndo()
      set((s) => completedRecordPatch(s, { title, dueDate, startTime, endTime, color }, logColorNames()))
    },
    addTimeLog: (title, date, startTime, endTime, tags, description, endDateArg, color) => {
      const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
      const endDate = endDateArg !== undefined && endDateArg !== null && endDateArg !== date ? endDateArg : null
      const log = makeTask(
        {
          title,
          listId: INBOX_ID,
          dueDate: date,
          endDate,
          startTime,
          endTime,
          kind: 'log',
          completed: true,
          tags: color ? (tags ?? []) : withInferredCategory(tags ?? [], get(), title),
          color: color ?? null,
        },
        maxOrder + 1,
      )
      if (description !== undefined) {
        log.description = description
      }
      pushUndo()
      set((s) => ({ tasks: [...s.tasks, log] }))
    },
    logSleep: (wakeDateKey, bedTime, wakeTime) => {
      if (bedTime === wakeTime) return
      const { dueDate, endDate } = sleepSpan(wakeDateKey, bedTime, wakeTime)
      const existing = sleepEndingOn(get().tasks, wakeDateKey)
      pushUndo()
      if (existing) {
        const now = new Date().toISOString()
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === existing.id ? { ...t, dueDate, endDate, startTime: bedTime, endTime: wakeTime, updatedAt: now } : t,
          ),
        }))
        return
      }
      const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
      const log = makeTask(
        {
          title: i18n.t('sleep.title'),
          listId: INBOX_ID,
          dueDate,
          endDate,
          startTime: bedTime,
          endTime: wakeTime,
          kind: 'sleep',
          completed: true,
        },
        maxOrder + 1,
      )
      set((s) => ({ tasks: [...s.tasks, log] }))
    },
    startTimer: (title, tags, taskId, color) => {
      // 走っているものを黙って捨てると記録が消える。先に記録にして閉じてから始め、切り替えたことを知らせる
      const previous = get().activeTimer
      if (previous) {
        // 1 分未満は記録に残らない（stopTimer と同じ判定）ので「保存して」とは言わない
        const saved = timerRecordTimes(previous.startedAt, new Date().toISOString()) !== null
        get().stopTimer()
        get().showMoveBanner({ key: saved ? 'quickLog.switched' : 'quickLog.switchedUnsaved', params: { title: previous.taskTitle } })
      }
      set({
        activeTimer: {
          taskTitle: title,
          startedAt: new Date().toISOString(),
          tags: color ? (tags ?? []) : withInferredCategory(tags ?? [], get(), title, { taskId }),
          taskId: taskId ?? null,
          color: color ?? null,
        },
        completePromptTaskId: null,
        labelPromptLogId: null,
      })
    },
    /** 取り残したタイマーを、指定の終了時刻までの記録にして閉じる */
    resolveStaleTimer: (endedAt) => {
      const timer = get().activeTimer
      if (!timer) return
      const times = timerRecordTimes(timer.startedAt, endedAt)
      if (!times) {
        set({ activeTimer: null, completePromptTaskId: null })
        return
      }
      const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
      pushUndo()
      set((s) => ({
        activeTimer: null,
        completePromptTaskId: null,
        tasks: [
          ...s.tasks,
          makeTask(
            {
              title: timer.taskTitle,
              listId: INBOX_ID,
              ...times,
              kind: 'log',
              completed: true,
              tags: timer.tags,
              color: timer.color ?? null,
            },
            maxOrder + 1,
          ),
        ],
      }))
    },
    discardActiveTimer: () => set({ activeTimer: null, completePromptTaskId: null }),
    dismissCompletePrompt: () => set({ completePromptTaskId: null }),
    dismissLabelPrompt: () => set({ labelPromptLogId: null }),

    stopTimer: () => {
      const timer = get().activeTimer
      if (!timer) return
      // 1 分未満は誤操作とみなして記録しない（`timerRecordTimes` が null を返す）
      const times = timerRecordTimes(timer.startedAt, new Date().toISOString())
      if (!times) {
        set({ activeTimer: null, completePromptTaskId: null })
        return
      }
      const { dueDate, endDate, startTime, endTime } = times
      const maxOrder = Math.max(0, ...get().tasks.map((t) => t.order))
      const linked = timer.taskId ? get().tasks.find((t) => t.id === timer.taskId) : null
      const log = makeTask(
        {
          title: timer.taskTitle,
          listId: INBOX_ID,
          dueDate,
          endDate,
          startTime,
          endTime,
          kind: 'log',
          completed: true,
          tags: timer.tags,
          color: timer.color ?? null,
        },
        maxOrder + 1,
      )
      const completePromptTaskId = linked && !linked.completed ? linked.id : null
      // ラベルなしで止めたら、その場でラベルを聞く（統計の 1 位が「ラベルなし」にならないように）。
      // 同じ位置に出る「完了にしますか？」を優先し、睡眠には聞かない
      const unlabeled = !log.category && !log.color && log.kind === 'log'
      pushUndo()
      set((s) => ({
        activeTimer: null,
        completePromptTaskId,
        labelPromptLogId: unlabeled && !completePromptTaskId ? log.id : null,
        tasks: [...s.tasks, log],
      }))
    },

    openRecordPrompt: (taskId) => set({ recordPromptTaskId: taskId }),
    logPlanAsPlanned: (taskId) => {
      const task = get().tasks.find((t) => t.id === taskId)
      const date = task ? taskPlacementDate(task) : null
      if (!task || task.completed || isLogTask(task) || !date || !task.startTime || !task.endTime) return
      const now = zonedNow()
      const today = toDateKey(now)
      const nowHm = clockOf(now)
      if (date > today || (date === today && task.startTime >= nowHm)) return
      const end = date === today && task.endTime > nowHm ? nowHm : task.endTime
      get().asOneUndo(() => {
        const { timeLogTagPresets, logCategoryColors } = get()
        const label = logLabelFromTask(task, timeLogTagPresets, logCategoryColors)
        get().addTimeLog(task.title, date, task.startTime!, end, label.tags, undefined, null, label.color)
        get().toggleTask(task.id)
      })
    },
  }
}
