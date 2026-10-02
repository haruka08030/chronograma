import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { CALENDAR_COLORS } from '../../lib/googleColors'
import { categoryHex, colorKeyForHex, unnamedColorKeys } from '../../lib/logCategoryColors'
import { Modal, ModalTitle } from '../ui/Modal'
import { SelectColorDialog } from './SelectColorDialog'
import { CaretDownIcon, PlusIcon, TrashIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'

let nextRowId = 0

interface Row {
  id: number
  /** 元のラベル名（新しい行は null） */
  from: string | null
  name: string
  hex: string
}

/**
 * Google カレンダーの「ラベル」と同じ編集画面: 色 ▾ ＋ 名前 ＋ 削除 の行を並べ、＋ で行を足し、保存でまとめて反映。
 * 最初は今のラベルの下に、まだ名前の無い色の行を空欄で並べる（色に名前を付ける感覚で書ける）。
 */
export function LabelsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const saveLogLabels = useTaskStore((s) => s.saveLogLabels)
  const [rows, setRows] = useState<Row[]>(() => [
    ...presets.map((n) => ({ id: nextRowId++, from: n, name: n, hex: categoryHex(n, colors) })),
    ...unnamedColorKeys(presets, colors).map((k) => ({
      id: nextRowId++,
      from: null,
      name: '',
      hex: CALENDAR_COLORS.find((c) => c.key === k)!.hex,
    })),
  ])
  const [colorFor, setColorFor] = useState<number | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))

  const addRow = () => {
    const used = new Set(rows.map((r) => r.hex))
    const hex = CALENDAR_COLORS.find((c) => !used.has(c.hex))?.hex ?? CALENDAR_COLORS[14].hex
    const id = nextRowId++
    setRows((rs) => [...rs, { id, from: null, name: '', hex }])
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLInputElement>(`[data-row="${id}"]`)
      el?.scrollIntoView({ block: 'nearest' })
      el?.focus()
    })
  }

  const save = () => {
    saveLogLabels(rows.map((r) => ({ from: r.from, name: r.name, color: colorKeyForHex(r.hex) ?? r.hex })))
    onClose()
  }

  const editing = rows.find((r) => r.id === colorFor)

  return (
    <>
      <Modal onClose={onClose} labelledBy="labels-title" className="flex max-h-[min(86vh,720px)] flex-col overflow-hidden">
          <div className="border-b border-zinc-200 px-6 pb-4 pt-6 dark:border-zinc-800">
            <ModalTitle id="labels-title">{t('labels.title')}</ModalTitle>
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
                    <span className="h-5 w-5 rounded-full" style={{ backgroundColor: r.hex }} aria-hidden />
                    <CaretDownIcon className="h-3 w-3 text-zinc-600 dark:text-zinc-300" />
                  </button>
                  <input
                    data-row={r.id}
                    value={r.name}
                    onChange={(e) => patch(r.id, { name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) save()
                    }}
                    placeholder={t('labels.placeholder')}
                    className="h-11 min-w-0 flex-1 rounded-lg bg-zinc-100 px-4 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-accent-500 dark:bg-zinc-700/60 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                  />
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                    aria-label={t('labels.remove')}
                    title={t('labels.remove')}
                    className="shrink-0 rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 md:opacity-0 md:focus-visible:opacity-100 md:group-focus-within:opacity-100 md:group-hover:opacity-100 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
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
              aria-label={t('labels.add')}
              title={t('labels.add')}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
            <span className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className={buttonClass({ variant: 'ghost', size: 'md' })}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={save}
              className={buttonClass({ variant: 'primary', size: 'md' })}
            >
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
