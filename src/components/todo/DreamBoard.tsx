import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { dreamSteps } from '../../lib/somedayTier'
import { colorVars } from '../../lib/logCategoryColors'
import { formatDate } from '../../lib/dateFormat'
import { openTaskDetail, openTaskMenu } from '../../lib/overlays'
import { useLongPress } from '../../hooks/useLongPress'
import { FulfilledMark } from '../ui/CompletionCircle'
import { GROUP_HEADING_TEXT } from '../ListSectionHeading'

/** タイルの並び（スマホ 2 列、広い画面ほど増やす）。夢とかなえた夢で同じ */
const GRID = 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5'

/**
 * 夢の 1 枚。セクションの色の薄い塗り＋縁（`gc-plan`。セクションの外は白地に灰色の縁）、題名、一歩があれば次の一歩と細い進み具合、セクション名。
 * 押すと詳細（一歩の追加はそこで）、右クリック・長押しで行と同じメニュー（かなえた・やりたいへ移す・削除）
 */
function DreamTile({ task, hex, sectionName }: { task: Task; hex: string | null; sectionName: string | null }) {
  const { t } = useTranslation()
  // 描き直しを抑えるため文字 1 つで受け取る（次の一歩・進み具合）
  const stepKey = useTaskStore((s) => {
    if (task.completed) return ''
    const steps = dreamSteps(s.tasks, task.id)
    return steps ? [steps.next?.title ?? '', String(steps.done), String(steps.total)].join('\u0000') : ''
  })
  const [nextTitle, done, total] = stepKey ? stepKey.split('\u0000') : ['', '0', '0']
  const openMenu = (x: number, y: number) => openTaskMenu({ kind: 'task', x, y, taskIds: [task.id] })
  const longPress = useLongPress((e) => openMenu(e.clientX, e.clientY))
  const doneDate = task.completed && task.completedAt ? formatDate(new Date(task.completedAt), 'fullDate') : null
  return (
    <div
      data-task-row={task.id}
      {...longPress.pointerHandlers}
      onClickCapture={longPress.onClickCapture}
      onContextMenu={(e) => {
        e.preventDefault()
        // 長押しで出る OS のメニューは抑え、長押しのほうで開く
        if (longPress.isPressing()) return
        openMenu(e.clientX, e.clientY)
      }}
      style={task.completed || !hex ? { WebkitTouchCallout: 'none' } : { ...colorVars(hex), WebkitTouchCallout: 'none' }}
      className={`relative flex min-h-[104px] min-w-0 select-none flex-col justify-between gap-2 rounded-xl p-3 transition-[filter] hover:brightness-[0.97] dark:hover:brightness-110 ${
        task.completed
          ? 'border border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-600 dark:text-zinc-400'
          : hex
            ? 'gc-plan'
            : 'border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400'
      }`}
    >
      {doneDate && <FulfilledMark />}
      {/* タイル全体を押せるよう、題名のボタンを枠いっぱいに広げる */}
      <button
        type="button"
        onClick={() => openTaskDetail(task.id)}
        className={`line-clamp-3 text-left text-[15px] font-medium leading-snug outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-accent-400/50 ${
          task.completed ? '' : 'text-zinc-800 dark:text-zinc-100'
        }`}
      >
        {task.title}
      </button>
      <div className="flex min-w-0 flex-col gap-1">
        {stepKey && (
          <>
            {nextTitle && (
              <span className="truncate text-[11px] text-zinc-600 dark:text-zinc-300">{t('someday.nextStep', { title: nextTitle })}</span>
            )}
            <span
              role="img"
              aria-label={t('someday.stepProgressAria', { progress: `${done}/${total}` })}
              className="block h-[3px] overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
            >
              <span
                className={`block h-full rounded-full ${hex ? 'gc-line' : 'bg-zinc-400 dark:bg-zinc-500'}`}
                style={{ width: `${Math.max(8, (Number(done) / Number(total)) * 100)}%` }}
              />
            </span>
          </>
        )}
        {doneDate ? (
          <span className="text-[11px]">{doneDate}</span>
        ) : (
          sectionName && <span className="truncate text-[11px] font-medium">{`# ${sectionName}`}</span>
        )}
      </div>
    </div>
  )
}

/**
 * いつかの夢ボード（#439）。夢をタイルで並べ、下にかなえた夢を日付つきで残す。
 * `heading` は絞り込み中（夢とやりたいを上下に並べるとき）の見出し
 */
export function DreamBoard({
  dreams,
  fulfilled,
  colorOf,
  sectionNameOf,
  heading = false,
}: {
  dreams: Task[]
  fulfilled: Task[]
  colorOf: (task: Task) => string | null
  sectionNameOf: (task: Task) => string | null
  heading?: boolean
}) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('someday.tierDream')} className="flex flex-col gap-2.5">
      {heading && <h2 className={`px-1 pt-1 ${GROUP_HEADING_TEXT}`}>{t('someday.tierDream')}</h2>}
      {dreams.length > 0 && (
        <div className={GRID}>
          {dreams.map((d) => (
            <DreamTile key={d.id} task={d} hex={colorOf(d)} sectionName={sectionNameOf(d)} />
          ))}
        </div>
      )}
      {fulfilled.length > 0 && (
        <>
          <h2 className={`px-1 pt-3 ${GROUP_HEADING_TEXT}`}>{t('someday.fulfilledDreams')}</h2>
          <div className={GRID}>
            {fulfilled.map((d) => (
              <DreamTile key={d.id} task={d} hex={colorOf(d)} sectionName={null} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
