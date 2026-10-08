import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_EXTRA_TIME_ZONES, useTaskStore } from '../../store/taskStore'
import { deviceTimeZone, zoneLongName, zoneOptionLabel } from '../../lib/timeZone'
import { TimeZonePicker } from '../TimeZonePicker'
import { SettingsGroup, SettingsRow } from './SettingsPrimitives'
import { CloseIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { fieldClass } from '../ui/fieldClass'
import { EXTRA_TIME_ZONE_LABEL_MAX } from '../../lib/extraTimeZones'
import { isCancelEscape, isImeKeyEvent, isSubmitEnter } from '../../lib/keyboard'
import { normalizeWeekStart, WEEK_START_OPTIONS, type WeekStartDay } from '../../lib/weekStart'
import { useWeekStartsOn } from '../../hooks/useWeekStartsOn'
import { Segmented } from '../ui/Segmented'

/** 設定「日付と時刻」: アプリのタイムゾーン、週の開始日、時間バーに並べる他のタイムゾーン（Google カレンダーと同じ） */
export function TimeZoneSettings() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('ja') ? 'ja' : 'en'
  const zone = useTaskStore((s) => s.appTimeZone)
  const setZone = useTaskStore((s) => s.setAppTimeZone)
  const extra = useTaskStore((s) => s.extraTimeZones)
  const setExtra = useTaskStore((s) => s.setExtraTimeZones)
  const setLabel = useTaskStore((s) => s.setExtraTimeZoneLabel)
  const device = deviceTimeZone()

  return (
    <SettingsGroup id="settings-time-zone" title={t('timeZone.title')}>
      <SettingsRow label={t('timeZone.primary')}>
        <TimeZonePicker
          ariaLabel={t('timeZone.primary')}
          value={zone}
          onChange={setZone}
          nullOption={t('timeZone.autoWith', { zone: zoneLongName(device, locale) })}
        />
      </SettingsRow>
      <WeekStartRow />
      <SettingsRow label={t('timeZone.extra')}>
        {extra.length < MAX_EXTRA_TIME_ZONES && (
          <TimeZonePicker
            ariaLabel={t('timeZone.add')}
            value={null}
            exclude={[...extra.map((z) => z.tz), zone ?? device]}
            onChange={(tz) => tz && setExtra([...extra, { tz, label: '' }])}
            trigger={({ open, toggle }) => (
              <button type="button" aria-expanded={open} onClick={toggle} className={buttonClass({ variant: 'secondary', size: 'md' })}>
                {t('timeZone.add')}
              </button>
            )}
          />
        )}
      </SettingsRow>
      {extra.map(({ tz, label }) => (
        <div key={tz} className="flex items-center gap-3 px-4 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-200">{zoneOptionLabel(tz, locale)}</span>
          {/* 付けた名前が変わったら（ほかの端末・タブで）書きかけを捨てて入れ直す */}
          <ZoneLabelInput
            key={label}
            value={label}
            ariaLabel={t('timeZone.labelFor', { zone: zoneOptionLabel(tz, locale) })}
            placeholder={t('timeZone.labelPlaceholder')}
            onCommit={(next) => setLabel(tz, next)}
          />
          <button
            type="button"
            aria-label={t('timeZone.remove', { zone: zoneOptionLabel(tz, locale) })}
            onClick={() => setExtra(extra.filter((z) => z.tz !== tz))}
            className="shrink-0 rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
    </SettingsGroup>
  )
}

/** 週の開始日（カレンダーの週・月表示と日付ピッカーの並び）。既定は月曜 */
function WeekStartRow() {
  const { t } = useTranslation()
  const weekStartsOn = useWeekStartsOn()
  const setWeekStartsOn = useTaskStore((s) => s.setWeekStartsOn)
  const labels: Record<WeekStartDay, string> = {
    6: t('weekStart.saturday'),
    0: t('weekStart.sunday'),
    1: t('weekStart.monday'),
  }
  return (
    <SettingsRow label={t('weekStart.label')} help={t('weekStart.help')}>
      <Segmented
        ariaLabel={t('weekStart.label')}
        value={String(weekStartsOn)}
        onChange={(v) => setWeekStartsOn(normalizeWeekStart(Number(v)))}
        options={WEEK_START_OPTIONS.map((d) => ({ value: String(d), label: labels[d] }))}
      />
    </SettingsRow>
  )
}

/** 他のタイムゾーンの名前。書き終えたら（フォーカスを外す・Enter）保存し、Esc で元に戻す */
function ZoneLabelInput({
  value,
  ariaLabel,
  placeholder,
  onCommit,
}: {
  value: string
  ariaLabel: string
  placeholder: string
  onCommit: (label: string) => void
}) {
  const [draft, setDraft] = useState(value)
  return (
    <input
      type="text"
      value={draft}
      maxLength={EXTRA_TIME_ZONE_LABEL_MAX}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() !== value) onCommit(draft)
        else setDraft(value)
      }}
      onKeyDown={(e) => {
        if (isImeKeyEvent(e.nativeEvent)) return
        if (isSubmitEnter(e)) e.currentTarget.blur()
        // 書きかけがあれば Esc はそれを戻すだけ（設定の画面は閉じない）
        if (isCancelEscape(e) && draft !== value) {
          setDraft(value)
          e.stopPropagation()
        }
      }}
      className={fieldClass({ size: 'sm' }, 'w-28 shrink-0 sm:w-44')}
    />
  )
}
