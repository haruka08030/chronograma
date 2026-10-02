import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { CALENDAR_COLORS } from '../../lib/googleColors'
import { categoryHex, colorKeyForHex, unnamedColorKeys } from '../../lib/logCategoryColors'
import { ModalLayer } from './ModalLayer'
import { SelectColorDialog } from './SelectColorDialog'

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
      <ModalLayer onDismiss={onClose} labelledBy="labels-title">
        <div className="flex max-h-[min(86vh,720px)] w-[min(92vw,440px)] flex-col rounded-3xl bg-white shadow-2xl dark:bg-zinc-800">
          <div className="border-b border-zinc-200 px-6 pb-4 pt-6 dark:border-zinc-700">
            <h2 id="labels-title" className="text-2xl text-zinc-900 dark:text-zinc-100">{t('labels.title')}</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">{t('labels.help')}</p>
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
                    <svg className="h-3 w-3 text-zinc-600 dark:text-zinc-300" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M7 10l5 5 5-5z" />
                    </svg>
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
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
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
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
            <span className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-5 py-2.5 text-sm font-medium text-accent-700 transition-colors hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-500/10"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-full bg-accent-600 px-6 py-2.5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-700"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </ModalLayer>
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
