import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CALENDAR_COLORS, textOnHex } from '../../lib/googleColors'
import { hexToHsv, hsvToHex } from '../../lib/colorMath'
import { Modal, ModalTitle } from '../ui/Modal'
import { CheckIcon, PencilSquareIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { tip } from '../../lib/tooltip'

const CHECK = (
  <CheckIcon className="h-4 w-4" strokeWidth={3} />
)

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> }

/**
 * Google カレンダーの「色を選択」と同じ: 24 色 + 自由な色（彩度・明度の四角、色相のスライダー、スポイト、Hex）。
 * 文字色は塗りの明るさから自動で決まる（`textOnHex`）。
 */
export function SelectColorDialog({
  initial,
  onSelect,
  onCancel,
}: {
  initial: string
  onSelect: (hex: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [hsv, setHsv] = useState(() => hexToHsv(initial))
  const [hex, setHex] = useState(initial.toUpperCase())
  const [hexDraft, setHexDraft] = useState(initial.toUpperCase())
  const squareRef = useRef<HTMLDivElement>(null)
  const EyeDropper = (globalThis as { EyeDropper?: EyeDropperCtor }).EyeDropper

  const applyHex = (next: string) => {
    const up = next.toUpperCase()
    setHex(up)
    setHexDraft(up)
    setHsv(hexToHsv(up))
  }
  const applyHsv = (h: number, s: number, v: number) => {
    setHsv([h, s, v])
    const next = hsvToHex(h, s, v)
    setHex(next)
    setHexDraft(next)
  }

  const pickOnSquare = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = squareRef.current?.getBoundingClientRect()
    if (!r) return
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    applyHsv(hsv[0], s, v)
  }

  const [h, s, v] = hsv
  const hueHex = hsvToHex(h, 1, 1)

  return (
    <Modal onClose={onCancel} labelledBy="select-color-title" width="sm" className="p-6">
        <ModalTitle id="select-color-title">{t('labels.selectColor')}</ModalTitle>

        <div role="radiogroup" aria-label={t('labels.selectColor')} className="mt-5 grid grid-cols-8 gap-2">
          {CALENDAR_COLORS.map((c) => {
            const selected = hex === c.hex
            return (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={t(`googleColors.${c.key}`)}
                {...tip(t(`googleColors.${c.key}`))}
                onClick={() => applyHex(c.hex)}
                className="flex aspect-square items-center justify-center rounded-full transition-transform hover:scale-110"
                style={{ backgroundColor: c.hex, color: textOnHex(c.hex) }}
              >
                {selected && CHECK}
              </button>
            )
          })}
        </div>

        <div className="mt-6 flex gap-4">
          <div className="flex flex-col items-center gap-3">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
              style={{ backgroundColor: hex, color: textOnHex(hex) }}
              aria-hidden
            >
              A
            </span>
            {EyeDropper && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await new EyeDropper().open()
                    if (/^#[0-9a-f]{6}$/i.test(res.sRGBHex)) applyHex(res.sRGBHex)
                  } catch {
                    /* キャンセル */
                  }
                }}
                aria-label={t('labels.eyedropper')}
                {...tip(t('labels.eyedropper'))}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
              >
                <PencilSquareIcon className="h-5 w-5" strokeWidth={1.75} />
              </button>
            )}
          </div>
          <div
            ref={squareRef}
            role="slider"
            aria-label={t('labels.saturation')}
            aria-valuenow={Math.round(s * 100)}
            tabIndex={0}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              pickOnSquare(e)
            }}
            onPointerMove={(e) => {
              if (e.buttons) pickOnSquare(e)
            }}
            className="relative h-36 min-w-0 flex-1 cursor-crosshair touch-none rounded-lg"
            style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueHex})` }}
          >
            <span
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
            />
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={359}
          value={Math.round(h)}
          onChange={(e) => applyHsv(Number(e.target.value), s, v)}
          aria-label={t('labels.hue')}
          className="hue-slider mt-4 w-full"
        />

        <label className="mt-4 block">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Hex</span>
          <input
            value={hexDraft}
            onChange={(e) => {
              const raw = e.target.value.trim()
              setHexDraft(raw)
              const withHash = raw.startsWith('#') ? raw : `#${raw}`
              if (/^#[0-9a-f]{6}$/i.test(withHash)) applyHex(withHash)
            }}
            onBlur={() => setHexDraft(hex)}
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2.5 font-mono text-sm text-zinc-900 outline-none focus:border-accent-500 dark:border-zinc-600 dark:text-zinc-100"
          />
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={buttonClass({ variant: 'ghost', size: 'md' })}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onSelect(hex)}
            className={buttonClass({ variant: 'primary', size: 'md' })}
          >
            {t('labels.select')}
          </button>
        </div>
    </Modal>
  )
}
