import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useTaskStore } from '../store/taskStore'
import { useDismiss } from '../hooks/useDismiss'
import { useIsCoarsePointer, useIsDesktop } from '../hooks/useMediaQuery'
import { useBulkTaskActions } from '../hooks/useBulkTaskActions'
import { useDateFormat } from '../hooks/useDateFormat'
import { appTodayKey } from '../lib/timeZone'
import { anchoredCardClass } from './ui/surface'
import { DatePickerBody } from './DatePickerBody'
import { TimeInput } from './TimeInput'
import { buttonClass } from './ui/buttonClass'
import { fieldClass } from './ui/fieldClass'
import { MenuLabel } from './ui/Menu'
import { sectionLabelClass } from './ui/sectionLabelClass'

const EDGE = 8
const WIDTH = 288

/**
 * 右クリックメニュー・シートの「締切 › 日時を指定…」。日付と時刻を一度に選んで「保存」で決める
 * （日付だけなら締切 › の中のカレンダーで足りる。時刻まで決めたいときにここ）。
 * PC は押した所に小さく、スマホは下からのシート（`TimeSlotMenu` と同じ）
 */
export function DueDateTimeMenu({
  x,
  y,
  taskIds,
  onClose,
  onDone,
}: {
  x: number
  y: number
  taskIds: string[]
  onClose: () => void
  onDone?: () => void
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const coarse = useIsCoarsePointer()
  const desktop = useIsDesktop()
  const sheet = coarse && !desktop
  const bulk = useBulkTaskActions()
  const targets = useTaskStore(useShallow((s) => s.tasks.filter((x) => taskIds.includes(x.id))))
  // 全部が同じ締切ならその日・時刻から始める（違えば今日・時刻なし）
  const dates = new Set(targets.map((x) => x.dueDate ?? null))
  const times = new Set(targets.map((x) => x.dueTime ?? null))
  const sharedDate = dates.size === 1 ? [...dates][0] : null
  const [date, setDate] = useState<string>(() => sharedDate ?? appTodayKey())
  const [time, setTime] = useState<string>(() => (sharedDate && times.size === 1 ? ([...times][0] ?? '') : ''))
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useDismiss({ open: true, onClose, inside: [panelRef] })

  // PC: 画面からはみ出さないよう、押した所の下（入らなければ上）に置く
  useLayoutEffect(() => {
    if (sheet || !panelRef.current) return
    const r = panelRef.current.getBoundingClientRect()
    const left = Math.min(Math.max(EDGE, x), window.innerWidth - r.width - EDGE)
    const top = y + r.height + EDGE > window.innerHeight ? Math.max(EDGE, window.innerHeight - r.height - EDGE) : y
    setPos({ left, top })
  }, [sheet, x, y])

  if (targets.length === 0) return null

  const save = () => {
    const label = time ? `${df.shortDate(date)} ${time}` : df.shortDate(date)
    bulk.setDueAt(taskIds, date, time || null, label)
    onDone?.()
    onClose()
  }

  return createPortal(
    <>
      {sheet && <div className="fixed inset-0 z-[59] animate-fade-in bg-black/30" aria-hidden onClick={onClose} />}
      <div
        ref={panelRef}
        role="dialog"
        aria-label={t('taskMenu.dueDateTime')}
        data-popover-keep
        className={`${anchoredCardClass(sheet)} p-2 ${sheet ? 'inset-x-0 bottom-0' : ''}`}
        style={sheet ? undefined : { left: pos.left, top: pos.top, width: WIDTH }}
      >
        {sheet && <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden />}
        <MenuLabel>
          {targets.length > 1 ? t('taskMenu.count', { count: targets.length }) : targets[0]!.title || t('taskMenu.one')}
        </MenuLabel>
        <div className={`px-2 pt-1 ${sheet ? 'mx-auto max-w-[272px]' : ''}`}>
          <DatePickerBody footer={false} value={date} onPick={(key) => key && setDate(key)} />
          <div className="mt-2 flex items-center gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-700">
            <span className={sectionLabelClass('field')}>{t('taskDetail.deadlineTime')}</span>
            <TimeInput
              value={time}
              onChange={setTime}
              ariaLabel={t('taskDetail.deadlineTime')}
              className={fieldClass({ size: 'sm' }, 'w-[5.5rem]')}
            />
            <button type="button" onClick={save} className={buttonClass({ variant: 'primary', size: 'sm' }, 'ml-auto')}>
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
