import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { HabitTimeMode, HabitWeekday } from '../../types/habit'
import { toggleHabitWeekdaySelection } from '../../lib/habitDraft'
import { HABIT_ON_TIME_TOLERANCE_MIN } from '../../lib/habitTiming'
import { labelForHex } from '../../lib/logCategoryColors'
import { addClockMinutes } from '../../lib/clockTime'
import { isSubmitEnter } from '../../lib/keyboard'
import { TimeInput } from '../TimeInput'
import { ColorPalette } from '../labels/ColorPalette'
import { PillToggle } from '../ui/PillToggle'
import { SectionLabel } from '../ui/SectionLabel'
import { fieldClass } from '../ui/fieldClass'
import { HINT_TEXT } from '../ui/textClass'
import type { HabitFormState } from './habitFormState'

const HABIT_WEEKDAY_ORDER: HabitWeekday[] = [1, 2, 3, 4, 5, 6, 7]

function ColorPicker({ color, onPick }: { color: string; onPick: (hex: string) => void }) {
  const { t } = useTranslation()
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  // 習慣の色＝記録のラベル。丸だけでは分からないので、選んでいる色のラベル名を出す
  const label = labelForHex(color, presets, colors)
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel as="span" level="field">
        {t('habits.color')}
      </SectionLabel>
      <ColorPalette bare selectedHex={color} onChoose={onPick} />
      <p className={HINT_TEXT}>{label ? t('habits.colorLabel', { label }) : t('habits.colorNoLabel')}</p>
    </div>
  )
}

function WeekdayPicker({
  freq,
  weekdays,
  onToggle,
}: {
  freq: 'daily' | 'weekly'
  weekdays: HabitWeekday[]
  onToggle: (v: HabitWeekday) => void
}) {
  const { t } = useTranslation()
  const labels = t('habits.weekdays', { returnObjects: true }) as string[]
  if (freq !== 'weekly') return null
  return (
    <PillToggle
      ariaLabel={t('habits.freqWeeklyLabel')}
      options={HABIT_WEEKDAY_ORDER.map((v) => ({ value: v, label: labels[v - 1] }))}
      values={weekdays}
      onToggle={onToggle}
    />
  )
}

function HabitTimeFields({
  mode,
  name,
  startTime,
  endTime,
  onModeChange,
  onStartTimeChange,
  onEndTimeChange,
}: {
  mode: HabitTimeMode
  name: string
  startTime: string
  endTime: string
  onModeChange: (mode: HabitTimeMode) => void
  onStartTimeChange: (time: string) => void
  onEndTimeChange: (time: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <input
            type="radio"
            name={`${name}-time-mode`}
            checked={mode === 'none'}
            onChange={() => onModeChange('none')}
            className="text-accent-500"
          />
          {t('habits.timeModeNone')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <input
            type="radio"
            name={`${name}-time-mode`}
            checked={mode === 'fixed'}
            onChange={() => onModeChange('fixed')}
            className="text-accent-500"
          />
          {t('habits.timeModeFixed')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <input
            type="radio"
            name={`${name}-time-mode`}
            checked={mode === 'range'}
            onChange={() => onModeChange('range')}
            className="text-accent-500"
          />
          {t('habits.timeModeRange')}
        </label>
      </div>

      {mode === 'fixed' ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <SectionLabel as="span" level="field">
            {t('habits.timeAt')}
          </SectionLabel>
          <TimeInput value={startTime} onChange={onStartTimeChange} className={fieldClass({ size: 'sm' }, 'w-[5.5rem] tabular-nums')} />
        </div>
      ) : null}

      {mode === 'range' ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <SectionLabel as="span" level="field">
            {t('habits.time')}
          </SectionLabel>
          <TimeInput value={startTime} onChange={onStartTimeChange} className={fieldClass({ size: 'sm' }, 'w-[5.5rem] tabular-nums')} />
          <span className="text-zinc-400">{t('common.timeRangeSeparator')}</span>
          <TimeInput
            value={endTime}
            onChange={onEndTimeChange}
            pickerDefault={startTime ? addClockMinutes(startTime, 60) : undefined}
            className={fieldClass({ size: 'sm' }, 'w-[5.5rem] tabular-nums')}
          />
        </div>
      ) : null}

      {mode !== 'none' ? <p className={HINT_TEXT}>{t('habits.onTimeHint', { min: HABIT_ON_TIME_TOLERANCE_MIN })}</p> : null}
    </div>
  )
}

/**
 * 習慣の追加・編集で共通の欄: 名前・色（＝ラベル）・毎日 / 週指定と曜日・時刻。
 * Enter で `onSubmit`、Esc で `onEscape`。`name` はラジオのまとまりの名前（追加と編集で分ける）
 */
export function HabitFormFields({
  form,
  onChange,
  name,
  placeholder,
  onSubmit,
  onEscape,
  titleRef,
}: {
  form: HabitFormState
  onChange: (patch: Partial<HabitFormState>) => void
  name: 'new-habit' | 'edit-habit'
  placeholder: string
  onSubmit: () => void
  onEscape: () => void
  titleRef?: Ref<HTMLInputElement>
}) {
  const { t } = useTranslation()
  return (
    <>
      <input
        ref={titleRef}
        value={form.title}
        onChange={(e) => onChange({ title: e.target.value })}
        onKeyDown={(e) => {
          if (isSubmitEnter(e)) {
            e.preventDefault()
            onSubmit()
          }
          if (e.key === 'Escape') onEscape()
        }}
        placeholder={placeholder}
        className={fieldClass({}, 'w-full')}
      />
      <ColorPicker color={form.color} onPick={(color) => onChange({ color })} />
      <div className="flex gap-6 text-sm">
        <label className="flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <input
            type="radio"
            name={`${name}-frequency`}
            checked={form.freq === 'daily'}
            onChange={() => onChange({ freq: 'daily' })}
            className="text-accent-500"
          />
          {t('habits.freqDaily')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <input
            type="radio"
            name={`${name}-frequency`}
            checked={form.freq === 'weekly'}
            onChange={() => onChange({ freq: 'weekly' })}
            className="text-accent-500"
          />
          {t('habits.freqWeeklyLabel')}
        </label>
      </div>
      <WeekdayPicker
        freq={form.freq}
        weekdays={form.weekdays}
        onToggle={(v) => onChange({ weekdays: toggleHabitWeekdaySelection(form.weekdays, v) })}
      />
      <HabitTimeFields
        mode={form.timeMode}
        name={name}
        startTime={form.startTime}
        endTime={form.endTime}
        onModeChange={(timeMode) => onChange({ timeMode })}
        onStartTimeChange={(startTime) => onChange({ startTime })}
        onEndTimeChange={(endTime) => onChange({ endTime })}
      />
    </>
  )
}
