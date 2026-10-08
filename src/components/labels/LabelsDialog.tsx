import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { CALENDAR_COLORS } from '../../lib/googleColors'
import { categoryHex, colorKeyForHex, unnamedColorKeys, colorVars } from '../../lib/logCategoryColors'
import { Modal, ModalTitle } from '../ui/Modal'
import { SelectColorDialog } from './SelectColorDialog'
import { CaretDownIcon, PlusIcon, TrashIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { iconButtonClass } from '../ui/iconButtonClass'
import { isSubmitEnter } from '../../lib/keyboard'
import { tip } from '../../lib/tooltip'
import { LABEL_NAME_INPUT_CLASS } from './labelNameInputClass'
import { REVEAL_ON_HOVER } from '../ui/revealClass'
import { CATEGORY_MAX_LENGTH } from '../../lib/textLimits'
import { parseTargetHours, targetHoursInput } from '../../lib/labelTargets'

let nextRowId = 0

interface Row {
  id: number
  /** 元のラベル名（新しい行は null） */
  from: string | null
  name: string
  hex: string
  /** 週の目安（時間）の欄の文字。空なら目安なし（#291） */
  target: string
}

/**
 * Google カレンダーの「ラベル」と同じ編集画面: 色 ▾ ＋ 名前 ＋ 削除 の行を並べ、＋ で行を足し、保存でまとめて反映。
 * 最初は今のラベルの下に、まだ名前の無い色の行を空欄で並べる（色に名前を付ける感覚で書ける）。
 * 名前の右に任意の「週に◯時間」の目安（#291）。週のふりかえりのラベル別の行で記録と並べる
 */
export function LabelsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const targets = useTaskStore((s) => s.logLabelTargets)
  const saveLogLabels = useTaskStore((s) => s.saveLogLabels)
  const [rows, setRows] = useState<Row[]>(() => [
    ...presets.map((n) => ({ id: nextRowId++, from: n, name: n, hex: categoryHex(n, colors), target: targetHoursInput(targets[n]) })),
    ...unnamedColorKeys(presets, colors).map((k) => ({
      id: nextRowId++,
      from: null,
      name: '',
      hex: CALENDAR_COLORS.find((c) => c.key === k)!.hex,
      target: '',
    })),
  ])
  const [colorFor, setColorFor] = useState<number | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))

  const addRow = () => {
    const used = new Set(rows.map((r) => r.hex))
    const hex = CALENDAR_COLORS.find((c) => !used.has(c.hex))?.hex ?? CALENDAR_COLORS[14].hex
    const id = nextRowId++
    setRows((rs) => [...rs, { id, from: null, name: '', hex, target: '' }])
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLInputElement>(`[data-row="${id}"]`)
      el?.scrollIntoView({ block: 'nearest' })
      el?.focus()
    })
  }

  const save = () => {
    saveLogLabels(
      rows.map((r) => ({
        from: r.from,
        name: r.name,
        color: colorKeyForHex(r.hex) ?? r.hex,
        weeklyTargetMinutes: parseTargetHours(r.target) ?? null,
      })),
    )
    onClose()
  }

  const editing = rows.find((r) => r.id === colorFor)

  return (
    <>
      <Modal onClose={onClose} labelledBy="labels-title" className="flex max-h-[min(86vh,720px)] flex-col overflow-hidden">
        <div className="border-b border-zinc-200 px-6 pb-4 pt-6 dark:border-zinc-700">
          <ModalTitle id="labels-title">{t('labels.title')}</ModalTitle>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t('labels.targetHint')}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <ul ref={listRef} className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="group flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setColorFor(r.id)}
                  aria-label={t('labels.changeColor')}
                  className="flex h-11 shrink-0 items-center gap-2 rounded-lg px-3 transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-accent-500 dark:hover:bg-zinc-700"
                >
                  <span className="gc-dot h-5 w-5 rounded-full" style={colorVars(r.hex)} aria-hidden />
                  <CaretDownIcon className="h-3 w-3 text-zinc-600 dark:text-zinc-300" />
                </button>
                <input
                  data-row={r.id}
                  value={r.name}
                  onChange={(e) => patch(r.id, { name: e.target.value })}
                  maxLength={CATEGORY_MAX_LENGTH}
                  onKeyDown={(e) => {
                    if (isSubmitEnter(e)) save()
                  }}
                  placeholder={t('labels.placeholder')}
                  className={LABEL_NAME_INPUT_CLASS}
                />
                {/* 週の目安（時間）。空なら目安なし。数として読めない文字は入らない。
                    名前の無い色の行には出さない（ごちゃつかせない・狭い画面で名前の欄を潰さない） */}
                {(r.name.trim() !== '' || r.target !== '') && (
                  <label className="flex shrink-0 items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <input
                      value={r.target}
                      inputMode="decimal"
                      onChange={(e) => {
                        if (parseTargetHours(e.target.value) !== undefined) patch(r.id, { target: e.target.value })
                      }}
                      onKeyDown={(e) => {
                        if (isSubmitEnter(e)) save()
                      }}
                      maxLength={5}
                      placeholder="–"
                      aria-label={t('labels.targetAria', { name: r.name.trim() || t('labels.placeholder') })}
                      className="h-11 w-12 rounded-lg bg-zinc-100 px-2 text-right text-sm tabular-nums text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-accent-500 dark:bg-zinc-700/60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                    />
                    <span aria-hidden>{t('labels.targetUnit')}</span>
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                  {...tip(t('labels.remove'), { name: true })}
                  className={iconButtonClass(REVEAL_ON_HOVER)}
                >
                  <TrashIcon className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <button
            type="button"
            onClick={addRow}
            {...tip(t('labels.add'), { name: true })}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={buttonClass({ variant: 'ghost', size: 'md' })}>
            {t('common.cancel')}
          </button>
          <button type="button" onClick={save} className={buttonClass({ variant: 'primary', size: 'md' })}>
            {t('common.save')}
          </button>
        </div>
      </Modal>
      {editing && (
        <SelectColorDialog
          initial={editing.hex}
          onCancel={() => setColorFor(null)}
          onSelect={(hex) => {
            patch(editing.id, { hex })
            setColorFor(null)
          }}
        />
      )}
    </>
  )
}
