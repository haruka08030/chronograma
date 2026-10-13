import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { subDays } from 'date-fns'
import { useTaskStore } from '../../store/taskStore'
import { isActiveTask } from '../../lib/taskLifecycle'
import { minutesOfLogOnCalendarDay } from '../../lib/taskTimeRange'
import { categoryHex, colorVars } from '../../lib/logCategoryColors'
import { appToday } from '../../lib/timeZone'
import { LabelsDialog } from '../labels/LabelsDialog'
import { SettingsLinkRow } from './SettingsPrimitives'
import { ChevronDownIcon, ChevronUpIcon } from '../icons'
import { toDateKey } from '../../lib/dateKey'
import { formatDuration } from '../../lib/timeGrid'
import { chipClass } from '../ui/chipClass'
import { HINT_TEXT, META_TEXT } from '../ui/textClass'
import { isLogTask, type Task } from '../../types/task'
import { isUnlabeledLog } from '../../lib/logCategory'
import { UntaggedLogList } from '../UntaggedLogList'
import { REVEAL_ON_HOVER } from '../ui/revealClass'

const USAGE_DAYS = 30

/**
 * 設定の「ラベル」。名前・色・追加・削除は「ラベルを編集」（✎ と同じ画面）だけで行い、
 * ここは直近 30 日の使用時間と並び順だけ。編集の入口が 2 つあると、削除やまとめ方の動きが食い違っていた。
 * 記録にだけあるラベル（候補に無い）は下にまとめて、ワンタップで候補に入れられる。
 */
export function CategoryManager() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const addLogCategory = useTaskStore((s) => s.addLogCategory)
  const moveLogCategory = useTaskStore((s) => s.moveLogCategory)

  const [editorOpen, setEditorOpen] = useState(false)

  /** 分類 → 直近 30 日の分数（分類なしは ''）と、ラベルなし（ラベル名も色も無い。睡眠は除く）の記録の分数・新しい順の id */
  const { usage, unlabeledMinutes, unlabeledIds } = useMemo(() => {
    const map = new Map<string, number>()
    const unlabeled: Task[] = []
    let unlabeledMin = 0
    const days = Array.from({ length: USAGE_DAYS }, (_, i) => toDateKey(subDays(appToday(), i)))
    for (const task of tasks) {
      if (!isLogTask(task) || !isActiveTask(task)) continue
      let minutes = 0
      for (const d of days) minutes += minutesOfLogOnCalendarDay(task, d)
      if (minutes <= 0) continue
      const key = task.category ?? ''
      map.set(key, (map.get(key) ?? 0) + minutes)
      if (isUnlabeledLog(task)) {
        unlabeled.push(task)
        unlabeledMin += minutes
      }
    }
    unlabeled.sort((a, b) => `${b.dueDate} ${b.startTime ?? ''}`.localeCompare(`${a.dueDate} ${a.startTime ?? ''}`))
    return { usage: map, unlabeledMinutes: unlabeledMin, unlabeledIds: unlabeled.map((x) => x.id) }
  }, [tasks])

  const unlisted = useMemo(() => {
    const set = new Set<string>()
    for (const task of tasks) {
      if (isLogTask(task) && isActiveTask(task) && task.category && !presets.includes(task.category)) set.add(task.category)
    }
    return [...set]
  }, [tasks, presets])

  // 開いたときのラベルなしの記録（付けても行は残し、押し間違いを直せる）。閉じていれば null
  const [unlabeledOpen, setUnlabeledOpen] = useState<string[] | null>(null)
  // まだ 1 件も記録していない人に、全部のラベルへ「未使用」と並べない（責められているように見える）
  const anyUsage = usage.size > 0

  return (
    <>
      <ul>
        {presets.map((name, i) => {
          const vars = colorVars(categoryHex(name, colors))
          const minutes = usage.get(name) ?? 0
          return (
            <li
              key={name}
              className="group relative flex min-h-12 items-center gap-3 border-b border-zinc-100 px-4 py-2 last:border-b-0 dark:border-zinc-800"
            >
              <span className="gc-dot h-4 w-4 shrink-0 rounded-full" style={vars} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">{name}</span>
              <span className={`shrink-0 tabular-nums ${META_TEXT}`}>
                {minutes > 0 ? formatDuration(minutes) : anyUsage ? t('categories.unused') : ''}
              </span>
              <div className={`flex shrink-0 items-center ${REVEAL_ON_HOVER}`}>
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => moveLogCategory(name, -1)}
                  aria-label={t('categories.moveUp', { name })}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                >
                  <ChevronUpIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={i === presets.length - 1}
                  onClick={() => moveLogCategory(name, 1)}
                  aria-label={t('categories.moveDown', { name })}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                >
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <SettingsLinkRow label={t('labels.edit')} onClick={() => setEditorOpen(true)} />

      {(unlisted.length > 0 || unlabeledMinutes > 0 || unlabeledOpen) && (
        <div className={`space-y-2 px-4 py-3 ${HINT_TEXT}`}>
          {unlisted.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span>{t('categories.unlisted')}</span>
              {unlisted.map((name) => (
                <button key={name} type="button" onClick={() => addLogCategory(name)} className={chipClass({ variant: 'add', size: 'sm' })}>
                  ＋ {name}
                </button>
              ))}
            </div>
          )}
          {(unlabeledMinutes > 0 || unlabeledOpen) && (
            <div>
              {/* 押すとラベルなしの記録を並べ、行のチップで付ける（「1 日を締める」と同じ行） */}
              <button
                type="button"
                aria-expanded={unlabeledOpen !== null}
                onClick={() => setUnlabeledOpen((v) => (v ? null : unlabeledIds))}
                className="-mx-1 inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-left transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                {t('categories.uncategorizedTime', { time: formatDuration(unlabeledMinutes) })}
                <ChevronDownIcon className={`h-3.5 w-3.5 shrink-0 transition-transform ${unlabeledOpen ? 'rotate-180' : ''}`} />
              </button>
              {unlabeledOpen && <UntaggedLogList ids={unlabeledOpen} showDate />}
            </div>
          )}
        </div>
      )}
      {editorOpen && <LabelsDialog onClose={() => setEditorOpen(false)} />}
    </>
  )
}
