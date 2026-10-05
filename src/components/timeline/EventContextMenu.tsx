import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { isLogTask, type Task } from '../../types/task'
import { NEUTRAL_HEX, DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { recordHex, colorVars } from '../../lib/logCategoryColors'
import { planTiming } from '../../lib/planTiming'
import { startTimerForTask } from '../../lib/timerDrop'
import { canEditGoogleEvent, removeGoogleEvent } from '../../lib/googleEventEdit'
import { useTaskColor } from '../../hooks/useTaskColor'
import { ColorPalette } from '../labels/ColorPalette'
import { ActionMenu, type ActionEntry } from '../ui/ActionMenu'
import { CheckIcon, ClockIcon, OpenPanelIcon, PlayIcon, TrashIcon } from '../icons'
import { useScheduleEntry } from '../../hooks/useScheduleEntry'

const ICON = 'h-4 w-4 flex-shrink-0'

/** 色の丸（中のメニューを開く項目のアイコン） */
function Dot({ hex }: { hex: string }) {
  return <span className="gc-dot mx-px h-3.5 w-3.5 flex-shrink-0 rounded-full" style={colorVars(hex)} aria-hidden />
}

/**
 * タイムラインの予定・記録を右クリックしたときのメニュー（押して出るカードと同じ操作を、カードを開かずに）。
 * 予定: 色・完了/未完了・予定どおり記録・記録を始める・詳細・削除。記録: 色（＝ラベル）・詳細・削除
 */
export function TaskEventMenu({
  x,
  y,
  taskId,
  onClose,
  onOpenDetail,
}: {
  x: number
  y: number
  taskId: string
  onClose: () => void
  onOpenDetail: (taskId: string) => void
}) {
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === taskId) ?? null)
  if (!task) return null
  return <TaskEventMenuBody x={x} y={y} task={task} onClose={onClose} onOpenDetail={onOpenDetail} />
}

function TaskEventMenuBody({
  x,
  y,
  task,
  onClose,
  onOpenDetail,
}: {
  x: number
  y: number
  task: Task
  onClose: () => void
  onOpenDetail: (taskId: string) => void
}) {
  const { t } = useTranslation()
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const openRecordPrompt = useTaskStore((s) => s.openRecordPrompt)
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
          // 始まった予定は「記録して完了」を先に（予定どおり / ずれた時刻を選ぶ画面）。完了だけは記録を残さない
          ...(canLogAsPlanned
            ? [
                {
                  kind: 'leaf' as const,
                  id: 'record-complete',
                  divider: true,
                  label: t('eventCard.recordAndComplete'),
                  icon: <ClockIcon className={ICON} />,
                  run: () => openRecordPrompt(task.id),
                },
              ]
            : []),
          {
            kind: 'leaf',
            id: 'toggle',
            divider: !canLogAsPlanned,
            label: task.completed ? t('eventCard.markIncomplete') : canLogAsPlanned ? t('eventCard.markDoneOnly') : t('eventCard.markDone'),
            icon: <CheckIcon className={ICON} />,
            run: () => toggleTask(task.id),
          },
          ...(!task.completed && !ended && activeTimer?.taskId !== task.id
            ? [
                {
                  kind: 'leaf' as const,
                  id: 'start',
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
      icon: <OpenPanelIcon className={ICON} />,
      run: () => onOpenDetail(task.id),
    },
    {
      kind: 'leaf',
      id: 'delete',
      label: t('common.delete'),
      icon: <TrashIcon className={ICON} />,
      danger: true,
      run: () => deleteTask(task.id),
    },
  ]
  return <ActionMenu x={x} y={y} header={task.title || t('taskMenu.one')} entries={entries} onClose={onClose} searchable={false} />
}

/**
 * Google の予定を右クリックしたときのメニュー（Google カレンダーの右クリックと同じく、色と削除）。
 * 書き込めない予定は「Google カレンダーで開く」だけ。繰り返しの色はカードの既定と同じく「すべての予定」に付ける
 */
export function GoogleEventMenu({ x, y, eventId, onClose }: { x: number; y: number; eventId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const event = useTaskStore((s) => s.calendarEvents.find((e) => e.id === eventId) ?? null)
  const googleCanWrite = useTaskStore((s) => s.googleCanWrite)
  const setGoogleEventColor = useTaskStore((s) => s.setGoogleEventColor)
  if (!event) return null
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
  if (entries.length === 0) return null
  return <ActionMenu x={x} y={y} header={event.summary} entries={entries} onClose={onClose} searchable={false} />
}
