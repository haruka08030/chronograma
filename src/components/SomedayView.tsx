import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { isActiveTask } from '../lib/taskLifecycle'
import { displayListName } from '../lib/displayListName'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import { ListKindPicker } from './ListKindPicker'
import { TaskDetail } from './TaskDetail'
import { DueDatePopover } from './DueDatePopover'
import { CalendarIcon } from './icons'
import type { TaskList } from '../types/list'
import type { Task } from '../types/task'
import { appTodayKey } from '../lib/timeZone'
import { isSubmitEnter } from '../lib/keyboard'
import { groupBySection } from '../lib/sectionGroups'
import { useSectionScrollTarget } from '../hooks/useSectionScrollTarget'
import { ListSectionHeading } from './ListSectionHeading'
import { tip } from '../lib/tooltip'
import { AddChildButton, ChildAddInput } from './ChildAddInput'
import { childrenByParent } from '../lib/listTree'

/**
 * いつか（Wish）用の画面。期限も優先度も出さず、1 行ずつ静かに並べる。
 * 行頭の ☆ で「かなえた」（下の★一覧へ）、右のカレンダー（予定する）で日付を選んで今日の計画（その日）へ移す。
 * 行の下に子を置ける（「中国語」の下に「HSK 合格」）。かなえた子は親の下に ★ のまま残す（親は自分でかなえる）
 */
export function SomedayView({ list }: { list: TaskList }) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const addTask = useTaskStore((s) => s.addTask)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const promoteToPlanned = useTaskStore((s) => s.promoteToPlanned)
  const showMoveBanner = useTaskStore((s) => s.showMoveBanner)
  const sections = useTaskStore((s) => s.sections)
  const quickAddSectionId = useTaskStore((s) => s.quickAddSectionId)
  const setQuickAddSectionId = useTaskStore((s) => s.setQuickAddSectionId)
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)
  const [draft, setDraft] = useState('')
  const [addingUnder, setAddingUnder] = useState<string | null>(null)
  const children = useMemo(() => childrenByParent(tasks, list.id), [tasks, list.id])

  const { wishes, fulfilled } = useMemo(() => {
    const items = tasks.filter((x) => x.listId === list.id && x.parentId === null && isActiveTask(x) && !x.isTimeLog)
    return {
      wishes: items.filter((x) => !x.completed).sort((a, b) => a.order - b.order),
      fulfilled: items
        .filter((x) => x.completed)
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    }
  }, [tasks, list.id])
  // まだのものはセクションごと。かなえたものは下にまとめたまま
  const wishGroups = useMemo(() => groupBySection(wishes, sections, list.id), [wishes, sections, list.id])
  const hasSections = wishGroups.length > 1
  useSectionScrollTarget(wishGroups)

  const submit = () => {
    const title = draft.trim()
    if (!title) return
    addTask(title, list.id)
    setDraft('')
  }

  const schedule = (item: Task, dateKey: string | null) => {
    if (!dateKey) return
    promoteToPlanned(item.id, dateKey)
    showMoveBanner(
      dateKey === appTodayKey()
        ? t('someday.movedToToday', { title: item.title })
        : t('someday.movedToDate', { title: item.title, date: format(parseISO(`${dateKey}T12:00:00`), t('someday.dateFormat')) }),
    )
  }

  const notePreview = (item: Task) => item.description.split('\n').find((l) => l.trim())?.trim() ?? ''

  const wishRow = (item: Task, depth = 0): ReactNode => {
    const note = notePreview(item)
    const kids = children.get(item.id) ?? []
    // かなえた子は親の下に残す（★）。かなえたルートは下の一覧へ行くのでここには来ない
    const fulfilledChild = depth > 0 && item.completed
    return (
      <li key={item.id}>
        <div
          className="group flex min-h-10 items-center gap-1 rounded-xl pr-1 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
          style={depth ? { marginLeft: depth * 32 } : undefined}
        >
          <button
            type="button"
            onClick={() => toggleTask(item.id)}
            {...tip(t(fulfilledChild ? 'someday.unfulfill' : 'someday.fulfill'))}
            aria-label={t(fulfilledChild ? 'someday.unfulfillItem' : 'someday.fulfillItem', { title: item.title })}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base transition-colors ${
              fulfilledChild
                ? 'text-amber-500 hover:text-zinc-300 dark:text-amber-400 dark:hover:text-zinc-600'
                : 'text-zinc-300 hover:text-amber-500 dark:text-zinc-600 dark:hover:text-amber-400'
            }`}
          >
            <span aria-hidden>{fulfilledChild ? '★' : '☆'}</span>
          </button>
          <button type="button" onClick={() => openDetail(item.id)} className="min-w-0 flex-1 py-2 text-left">
            <span className={`block truncate text-sm ${fulfilledChild ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-100'}`}>{item.title}</span>
            {note && <span className="mt-0.5 block truncate text-xs text-zinc-400 dark:text-zinc-500">{note}</span>}
          </button>
          {kids.length > 0 && (
            <span className="shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
              {t('nestedList.progress', { done: kids.filter((k) => k.completed).length, total: kids.length })}
            </span>
          )}
          {depth === 0 && <AddChildButton title={item.title} onClick={() => setAddingUnder(item.id)} />}
          {!fulfilledChild && (
            <DueDatePopover
              value={null}
              onChange={(key) => schedule(item, key)}
              kind="scheduled"
              wrapperClassName="relative shrink-0"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  {...tip(t('someday.schedule'))}
                  aria-label={t('someday.scheduleItem', { title: item.title })}
                  aria-expanded={open}
                  aria-haspopup="dialog"
                  onClick={toggle}
                  // To-Do の行の日付ボタンと同じ。PC はホバー（か開いている間）だけ出す
                  className={`rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200 touch-manipulation md:p-1 dark:hover:bg-zinc-700
                             ${open ? 'bg-zinc-200 dark:bg-zinc-700' : 'md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100'}`}
                >
                  <CalendarIcon className="h-5 w-5 md:h-4 md:w-4" />
                </button>
              )}
            />
          )}
        </div>
        {(kids.length > 0 || addingUnder === item.id) && (
          <ul>
            {kids.map((k) => wishRow(k, depth + 1))}
            {addingUnder === item.id && (
              <li style={{ marginLeft: (depth + 1) * 32 }} className="pl-2.5 pr-1">
                <ChildAddInput parentId={item.id} onClose={() => setAddingUnder(null)} />
              </li>
            )}
          </ul>
        )}
      </li>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="w-full px-4 pb-24 pt-6 md:px-6 md:pt-8">
        <header className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{displayListName(list.id, list.name)}</h1>
          </div>
          <ListKindPicker list={list} />
        </header>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-zinc-200 px-4 dark:border-zinc-700">
          <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>☆</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (isSubmitEnter(e)) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={t('someday.addPlaceholder')}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
          />
        </div>

        {wishes.length === 0 && !hasSections ? (
          <p className="mt-6 text-sm leading-relaxed text-zinc-400 dark:text-zinc-500">{t('someday.empty')}</p>
        ) : (
          wishGroups.map(({ section, items }) => (
            <div key={section?.id ?? 'none'}>
              {section && (
                <ListSectionHeading
                  section={section}
                  isTarget={quickAddSectionId === section.id}
                  onToggleTarget={() => setQuickAddSectionId(quickAddSectionId === section.id ? null : section.id)}
                />
              )}
              <ul className={section ? '' : 'mt-3'}>{items.map((x) => wishRow(x))}</ul>
            </div>
          ))
        )}

        {fulfilled.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-1 text-xs font-medium text-zinc-400 dark:text-zinc-500">{t('someday.fulfilledHeading', { count: fulfilled.length })}</h2>
            <ul>
              {fulfilled.map((item) => (
                <li key={item.id} className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                  <button
                    type="button"
                    onClick={() => toggleTask(item.id)}
                    {...tip(t('someday.unfulfill'))}
                    aria-label={t('someday.unfulfillItem', { title: item.title })}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-amber-500 transition-colors hover:text-zinc-300 dark:text-amber-400 dark:hover:text-zinc-600"
                  >
                    <span aria-hidden>★</span>
                  </button>
                  <button type="button" onClick={() => openDetail(item.id)} className="min-w-0 truncate text-left">
                    {item.title}
                  </button>
                  {item.completedAt && (
                    <span className="ml-1 shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                      {format(new Date(item.completedAt), 'yyyy/M/d')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {detailTask && <TaskDetail task={detailTask} onClose={closeDetail} />}
    </div>
  )
}
