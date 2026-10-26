import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { skippedEventById } from '../../hooks/useShownCalendarEvents'
import { isEventTask, isLogTask, type Task } from '../../types/task'
import { NEUTRAL_HEX, DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { recordHex, colorVars } from '../../lib/logCategoryColors'
import { planTiming } from '../../lib/planTiming'
import { startTimerForTask } from '../../lib/timerDrop'
import { canEditGoogleEvent, duplicateGoogleEvent, removeGoogleEvent } from '../../lib/googleEventEdit'
import { useTaskColor } from '../../hooks/useTaskColor'
import { ColorPalette } from '../labels/ColorPalette'
import { ActionMenu, type ActionEntry } from '../ui/ActionMenu'
import { CheckIcon, ClockIcon, DuplicateIcon, OpenPanelIcon, PencilIcon, PlayIcon, TrashIcon } from '../icons'
import { useScheduleEntry } from '../../hooks/useScheduleEntry'
import { deleteTaskAsking } from '../../lib/seriesScope'

const ICON = 'h-4 w-4 flex-shrink-0'

/** 色の丸（中のメニューを開く項目のアイコン） */
function Dot({ hex }: { hex: string }) {
  return <span className="gc-dot mx-px h-3.5 w-3.5 flex-shrink-0 rounded-full" style={colorVars(hex)} aria-hidden />
}

/**
 * 月・予定リスト・日の一覧で予定・記録を右クリックしたときのメニュー。
 * タイムラインの右クリック・長押しは `brief` で完了 / 未完了・複製だけ（ほかはカードと編集画面）。
 * 予定: 色・完了/未完了・予定どおり記録・記録を始める・編集・コピー・削除。
 * 記録: 色（＝ラベル）・編集・削除
 */
export function TaskEventMenu({
  x,
  y,
  brief,
  taskId,
  onClose,
  onOpenDetail,
}: {
  x: number
  y: number
  /** タイムラインの右クリック: 完了 / 未完了・複製だけ（ほかはカードと編集画面） */
  brief?: boolean
  taskId: string
  onClose: () => void
  onOpenDetail: (taskId: string) => void
}) {
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === taskId) ?? null)
  if (!task) return null
  return <TaskEventMenuBody x={x} y={y} brief={brief} task={task} onClose={onClose} onOpenDetail={onOpenDetail} />
}

function TaskEventMenuBody({
  x,
  y,
  brief,
  task,
  onClose,
  onOpenDetail,
}: {
  x: number
  y: number
  brief?: boolean
  task: Task
  onClose: () => void
  onOpenDetail: (taskId: string) => void
}) {
  const { t } = useTranslation()
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const openRecordPrompt = useTaskStore((s) => s.openRecordPrompt)
  const duplicateTasks = useTaskStore((s) => s.duplicateTasks)
  const isEvent = isEventTask(task)
  const isLog = isLogTask(task)
  const color = useTaskColor(task, !isLog)
  const hex = isLog ? recordHex(task, logCategoryColors) : task.color || NEUTRAL_HEX
  const { canLogAsPlanned, ended } = planTiming(task)
  // 予定は行のメニューと同じ「予定日」で別の日へ（時刻はそのまま）
  const scheduleEntry = useScheduleEntry([task.id], (fn) => fn, ICON)

  const entries: ActionEntry[] = [
    {
      kind: 'sub',
      id: 'color',
      label: t('labels.pickerAria'),
      icon: <Dot hex={hex} />,
      leaves: [],
      width: 'lg',
      extra: (close) => (
        <ColorPalette
          bare
          fill
          selectedHex={color.current}
          onChoose={(h) => {
            color.choose(h)
            close()
          }}
          onDefault={() => {
            color.choose(null)
            close()
          }}
          defaultLabel={color.defaultLabel}
          defaultHex={color.defaultHex}
        />
      ),
    },
    ...(isLog ? [] : [scheduleEntry]),
    ...(isLog
      ? []
      : ([
          // 始まった予定は「記録して完了」を先に（予定どおり / ずれた時刻を選ぶ画面）。完了だけは記録を残さない。
          // 予定（完了の無いもの）は「記録にする」だけ
          ...(canLogAsPlanned
            ? [
                {
                  kind: 'leaf' as const,
                  id: 'record-complete',
                  divider: true,
                  label: isEvent ? t('eventCard.toRecord') : t('eventCard.recordAndComplete'),
                  icon: <ClockIcon className={ICON} />,
                  run: () => openRecordPrompt(task.id),
                },
              ]
            : []),
          ...(isEvent
            ? []
            : [
                {
                  kind: 'leaf' as const,
                  id: 'toggle',
                  divider: !canLogAsPlanned,
                  label: task.completed
                    ? t('eventCard.markIncomplete')
                    : canLogAsPlanned
                      ? t('eventCard.markDoneOnly')
                      : t('eventCard.markDone'),
                  icon: <CheckIcon className={ICON} />,
                  run: () => toggleTask(task.id),
                },
              ]),
          ...(!task.completed && !ended && activeTimer?.taskId !== task.id
            ? [
                {
                  kind: 'leaf' as const,
                  id: 'start',
                  divider: isEvent && !canLogAsPlanned,
                  label: t('eventCard.startLog'),
                  icon: <PlayIcon className="h-3.5 w-3.5" />,
                  run: () => void startTimerForTask(task.id),
                },
              ]
            : []),
        ] satisfies ActionEntry[])),
    {
      kind: 'leaf',
      id: 'open',
      divider: isLog,
      label: t('taskMenu.open'),
      icon: <PencilIcon className={ICON} />,
      run: () => onOpenDetail(task.id),
    },
    // 同じ日・同じ時間に写し、写したものの詳細を開く（行のメニューの「複製」と同じ）
    ...(isLog
      ? []
      : [
          {
            kind: 'leaf' as const,
            id: 'duplicate',
            label: t('taskMenu.duplicate'),
            icon: <DuplicateIcon className={ICON} />,
            run: () => {
              const [copy] = duplicateTasks([task.id])
              if (copy) onOpenDetail(copy)
            },
          },
        ]),
    {
      kind: 'leaf',
      id: 'delete',
      label: t('common.delete'),
      icon: <TrashIcon className={ICON} />,
      danger: true,
      // 毎週の予定は範囲を聞いてから
      run: () => void deleteTaskAsking(task.id),
    },
  ]
  const shown = brief
    ? entries.filter((e) => e.id === 'toggle' || e.id === 'duplicate').map((e) => (e.kind === 'leaf' ? { ...e, divider: false } : e))
    : entries
  if (shown.length === 0) return null
  return <ActionMenu x={x} y={y} header={task.title || t('taskMenu.one')} entries={shown} onClose={onClose} searchable={false} />
}

/**
 * Google の予定を右クリックしたときのメニュー（Google カレンダーの右クリックと同じく、色・コピー・削除）。
 * タイムラインの右クリック・長押しは `brief` でコピーだけ（ほかはカード）。
 * 書き込めない予定は「Google カレンダーで開く」だけ。繰り返しの色はカードの既定と同じく「すべての予定」に付ける。
 * やらなかった予定（#528）は削除だけ（予定していなかったものを消す）
 */
export function GoogleEventMenu({
  x,
  y,
  brief,
  eventId,
  onClose,
}: {
  x: number
  y: number
  /** タイムラインの右クリック: コピーだけ（ほかはカード） */
  brief?: boolean
  eventId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const liveEvent = useTaskStore((s) => s.calendarEvents.find((e) => e.id === eventId) ?? null)
  const skipped = useTaskStore((s) => !liveEvent && s.skippedEvents.some((e) => e.id === eventId && !e.removed))
  const event = liveEvent ?? (skipped ? skippedEventById(eventId) : null)
  const googleCanWrite = useTaskStore((s) => s.googleCanWrite)
  const setGoogleEventColor = useTaskStore((s) => s.setGoogleEventColor)
  const removeSkippedEvent = useTaskStore((s) => s.removeSkippedEvent)
  if (!event) return null
  if (skipped) {
    const remove: ActionEntry = {
      kind: 'leaf',
      id: 'delete',
      label: t('common.delete'),
      icon: <TrashIcon className={ICON} />,
      danger: true,
      run: () => removeSkippedEvent(event.id),
    }
    return <ActionMenu x={x} y={y} header={event.summary} entries={[remove]} onClose={onClose} searchable={false} />
  }
  const editable = canEditGoogleEvent(event, googleCanWrite)
  const scope = event.recurringEventId ? 'series' : 'event'
  const entries: ActionEntry[] = [
    ...(editable
      ? [
          {
            kind: 'sub' as const,
            id: 'color',
            label: t('labels.pickerAria'),
            icon: <Dot hex={event.color ?? DEFAULT_GOOGLE_EVENT_HEX} />,
            leaves: [],
            width: 'lg' as const,
            extra: (close: () => void) => (
              <ColorPalette
                bare
                fill
                selectedHex={event.color ?? DEFAULT_GOOGLE_EVENT_HEX}
                onChoose={(h) => {
                  setGoogleEventColor(event, h, scope)
                  close()
                }}
                onDefault={() => {
                  setGoogleEventColor(event, null, scope)
                  close()
                }}
                defaultLabel={t('eventCard.googleColor')}
                defaultHex={event.baseColor ?? DEFAULT_GOOGLE_EVENT_HEX}
              />
            ),
          },
        ]
      : []),
    // 同じ日・同じ時間にもう 1 つ（自分の予定の「コピー」と同じ）
    ...(editable
      ? [
          {
            kind: 'leaf' as const,
            id: 'duplicate',
            label: t('taskMenu.duplicate'),
            icon: <DuplicateIcon className={ICON} />,
            run: () => void duplicateGoogleEvent(event),
          },
        ]
      : []),
    ...(event.htmlLink
      ? [
          {
            kind: 'leaf' as const,
            id: 'open-google',
            label: t('googleEdit.openInGoogle'),
            icon: <OpenPanelIcon className={ICON} />,
            run: () => void window.open(event.htmlLink, '_blank', 'noopener,noreferrer'),
          },
        ]
      : []),
    ...(editable
      ? [
          {
            kind: 'leaf' as const,
            id: 'delete',
            label: t('common.delete'),
            icon: <TrashIcon className={ICON} />,
            danger: true,
            run: () => removeGoogleEvent(event),
          },
        ]
      : []),
  ]
  const shown = brief ? entries.filter((e) => e.id === 'duplicate') : entries
  if (shown.length === 0) return null
  return <ActionMenu x={x} y={y} header={event.summary} entries={shown} onClose={onClose} searchable={false} />
}
