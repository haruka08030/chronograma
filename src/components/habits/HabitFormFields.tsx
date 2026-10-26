import { useId, useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import {
  HABIT_GOAL_MINUTES_MAX,
  HABIT_TIMES_PER_WEEK_MAX,
  HABIT_TIMES_PER_WEEK_MIN,
  type HabitFrequencyType,
  type HabitWeekday,
} from '../../types/habit'
import { toggleHabitWeekdaySelection } from '../../lib/habitDraft'
import { HABIT_ON_TIME_TOLERANCE_MIN } from '../../lib/habitTiming'
import { labelForHex } from '../../lib/logCategoryColors'
import { addClockMinutes, toMinutes } from '../../lib/clockTime'
import { isCancelEscape, isSubmitEnter } from '../../lib/keyboard'
import { TimeInput } from '../TimeInput'
import { ColorPalette } from '../labels/ColorPalette'
import { PillToggle } from '../ui/PillToggle'
import { SectionLabel } from '../ui/SectionLabel'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { fieldClass } from '../ui/fieldClass'
import { HINT_TEXT } from '../ui/textClass'
import { effectiveHabitForm, formWeekdayTime, usesWeekdayTimes, type HabitFormState } from './habitFormState'
import { buttonClass } from '../ui/buttonClass'
import { DisclosureButton } from '../ui/Disclosure'
import { PlusIcon } from '../icons'
import { TITLE_MAX_LENGTH } from '../../lib/textLimits'

const HABIT_WEEKDAY_ORDER: HabitWeekday[] = [1, 2, 3, 4, 5, 6, 7]
const TIMES_PER_WEEK_OPTIONS = Array.from(
  { length: HABIT_TIMES_PER_WEEK_MAX - HABIT_TIMES_PER_WEEK_MIN + 1 },
  (_, i) => HABIT_TIMES_PER_WEEK_MIN + i,
)
/** 頻度の選択肢（毎日 / 曜日を指定 / 回数を指定＝週に◯回） */
const FREQ_OPTIONS: { value: HabitFrequencyType; labelKey: string }[] = [
  { value: 'daily', labelKey: 'habits.freqDaily' },
  { value: 'weekly', labelKey: 'habits.freqWeeklyLabel' },
  { value: 'timesPerWeek', labelKey: 'habits.freqTimesPerWeek' },
]
/** ルーティンはやる日の決まった予定なので、週に◯回は選べない */
const ROUTINE_FREQ_OPTIONS = FREQ_OPTIONS.filter((o) => o.value !== 'timesPerWeek')

/** 種類の選択肢（習慣 / ルーティン） */
const KIND_OPTIONS: { value: 'habit' | 'routine'; labelKey: string }[] = [
  { value: 'habit', labelKey: 'habits.kindHabit' },
  { value: 'routine', labelKey: 'habits.kindRoutine' },
]

/**
 * 見出し付きのラジオのまとまり（くり返し・時間）。見出しは色の見出しと同じ SectionLabel。
 * まとまりごとに見出しを付けて、続けて並んでも 6 択に見えないようにする
 */
function RadioChoices<T extends string>({
  heading,
  name,
  options,
  value,
  onChange,
}: {
  heading: string
  name: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  const headingId = useId()
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel as="span" level="field" id={headingId}>
        {heading}
      </SectionLabel>
      <div role="radiogroup" aria-labelledby={headingId} className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
            <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} className="text-accent-500" />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  )
}

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

function WeekdayPicker({ weekdays, onToggle }: { weekdays: HabitWeekday[]; onToggle: (v: HabitWeekday) => void }) {
  const { t } = useTranslation()
  const labels = t('habits.weekdays', { returnObjects: true }) as string[]
  return (
    <PillToggle
      ariaLabel={t('habits.freqWeeklyLabel')}
      options={HABIT_WEEKDAY_ORDER.map((v) => ({ value: v, label: labels[v - 1] }))}
      values={weekdays}
      onToggle={onToggle}
    />
  )
}

/** 週に◯回の回数（1〜6）。1 つだけ選ぶ */
function TimesPerWeekPicker({ count, onChange }: { count: number; onChange: (count: number) => void }) {
  const { t } = useTranslation()
  return (
    <PillToggle
      ariaLabel={t('habits.timesPerWeekAria')}
      options={TIMES_PER_WEEK_OPTIONS.map((n) => ({ value: n, label: t('habits.timesPerWeekOption', { count: n }) }))}
      value={count}
      onChange={onChange}
    />
  )
}

const TIME_FIELD = fieldClass({ size: 'sm' }, 'w-[5.5rem] tabular-nums')

/**
 * 時間帯の開始を動かしたあとの終わり。長さを保ってずらす（習慣は日をまたげるので 23:59 で止めない）。
 * 終わりが空なら既定の予定の長さで埋める
 */
function habitEndAfterStartEdit(startTime: string, endTime: string, nextStart: string, fillMinutes: number): string {
  const s = toMinutes(startTime)
  const e = toMinutes(endTime)
  if (toMinutes(nextStart) === null) return endTime
  if (e === null) return addClockMinutes(nextStart, fillMinutes)
  if (s === null || nextStart === startTime) return endTime
  return addClockMinutes(nextStart, (e - s + 1440) % 1440 || fillMinutes)
}

/** 開始（と時間帯なら終了）の欄 */
function TimeRangeInputs({
  mode,
  startTime,
  endTime,
  onTimesChange,
}: {
  mode: 'fixed' | 'range'
  startTime: string
  endTime: string
  onTimesChange: (patch: { startTime?: string; endTime?: string }) => void
}) {
  const { t } = useTranslation()
  const defaultBlockMinutes = useTaskStore((s) => s.defaultBlockMinutes)
  return (
    <>
      {/* 時間帯は開始を動かしたら長さを保って終わりもずらす（予定の欄と同じ。日をまたいでもよい） */}
      <TimeInput
        value={startTime}
        onChange={(v) =>
          onTimesChange(
            mode === 'range'
              ? { startTime: v, endTime: habitEndAfterStartEdit(startTime, endTime, v, defaultBlockMinutes) }
              : { startTime: v },
          )
        }
        className={TIME_FIELD}
      />
      {mode === 'range' ? (
        <>
          <span className="text-zinc-400">{t('common.timeRangeSeparator')}</span>
          <TimeInput
            value={endTime}
            onChange={(v) => onTimesChange({ endTime: v })}
            pickerDefault={startTime ? addClockMinutes(startTime, defaultBlockMinutes) : undefined}
            durationFrom={startTime || undefined}
            overnight
            className={TIME_FIELD}
          />
        </>
      ) : null}
    </>
  )
}

/** 曜日ごとの時間の行（選んだ曜日だけ、月曜から） */
function WeekdayTimeRows({ form, onChange }: { form: HabitFormState; onChange: (patch: Partial<HabitFormState>) => void }) {
  const { t } = useTranslation()
  const labels = t('habits.weekdays', { returnObjects: true }) as string[]
  const mode = form.timeMode === 'range' ? 'range' : 'fixed'
  const set = (d: HabitWeekday, patch: Partial<{ startTime: string; endTime: string }>) =>
    onChange({ weekdayTimes: { ...form.weekdayTimes, [d]: { ...formWeekdayTime(form, d), ...patch } } })
  return (
    <div className="space-y-2">
      {[...form.weekdays]
        .sort((a, b) => a - b)
        .map((d) => {
          const time = formWeekdayTime(form, d)
          return (
            <div key={d} role="group" aria-label={labels[d - 1]} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="w-6 text-zinc-500 dark:text-zinc-400">{labels[d - 1]}</span>
              <TimeRangeInputs mode={mode} startTime={time.startTime} endTime={time.endTime} onTimesChange={(patch) => set(d, patch)} />
            </div>
          )
        })}
    </div>
  )
}

/**
 * 時間の欄。時間を決めていなければ「時間を決める」のボタンだけ（押すと開始〜終了の欄）。
 * 終わりは外せる（時刻だけ）・あとから足せる。ルーティンは時間帯が要るので、最初から開始〜終了で外せない
 */
function HabitTimeFields({ form, onChange }: { form: HabitFormState; onChange: (patch: Partial<HabitFormState>) => void }) {
  const { t } = useTranslation()
  const routine = form.kind === 'routine'
  const mode = form.timeMode
  const linkClass = buttonClass({ variant: 'link', size: 'xs' })
  if (mode === 'none') {
    return (
      <div>
        <button type="button" onClick={() => onChange({ timeMode: 'range' })} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          <PlusIcon className="h-3.5 w-3.5" />
          {t('habits.setTime')}
        </button>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <SectionLabel as="span" level="field">
        {t('habits.time')}
      </SectionLabel>
      {usesWeekdayTimes(form) ? (
        <WeekdayTimeRows form={form} onChange={onChange} />
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <TimeRangeInputs mode={mode} startTime={form.startTime} endTime={form.endTime} onTimesChange={onChange} />
        </div>
      )}
      {routine ? null : (
        <div className="-ml-2.5 flex flex-wrap gap-x-2">
          <button type="button" onClick={() => onChange({ timeMode: mode === 'range' ? 'fixed' : 'range' })} className={linkClass}>
            {mode === 'range' ? t('habits.removeEndTime') : t('habits.addEndTime')}
          </button>
          <button type="button" onClick={() => onChange({ timeMode: 'none' })} className={linkClass}>
            {t('habits.removeTime')}
          </button>
        </div>
      )}
      {routine ? null : <p className={HINT_TEXT}>{t('habits.onTimeHint', { min: HABIT_ON_TIME_TOLERANCE_MIN })}</p>}
    </div>
  )
}

/**
 * 「詳しく設定」の中: 曜日ごとに時間を変える（曜日を指定して時間を決めたとき）・1 回の目標（習慣だけ）。
 * どちらも出せないときは何も出さない。使っている習慣を編集するときは最初から開く
 */
function AdvancedFields({ form, onChange }: { form: HabitFormState; onChange: (patch: Partial<HabitFormState>) => void }) {
  const { t } = useTranslation()
  const routine = form.kind === 'routine'
  const canPerWeekday = form.freq === 'weekly' && form.timeMode !== 'none'
  const [open, setOpen] = useState(() => (canPerWeekday && form.perWeekday) || (!routine && form.goalMinutes.trim() !== ''))
  if (!canPerWeekday && routine) return null
  return (
    <div className="space-y-2">
      <DisclosureButton open={open} onToggle={() => setOpen((v) => !v)} className="-ml-3">
        {t('habits.advanced')}
      </DisclosureButton>
      {open ? (
        <div className="space-y-3">
          {/* 押さなければ今までどおり 1 つの時間 */}
          {canPerWeekday ? (
            <button
              type="button"
              aria-pressed={form.perWeekday}
              onClick={() => onChange({ perWeekday: !form.perWeekday })}
              // 文字の頭を欄の頭にそろえる
              className={buttonClass({ variant: 'link', size: 'xs' }, '-ml-2.5')}
            >
              {form.perWeekday ? t('habits.sameTimeEveryDay') : t('habits.timePerWeekday')}
            </button>
          ) : null}
          {routine ? null : <GoalMinutesField value={form.goalMinutes} onChange={(goalMinutes) => onChange({ goalMinutes })} />}
        </div>
      ) : null}
    </div>
  )
}

/** 1 回の時間の目標（分）。空なら目標なし（チェックで達成） */
function GoalMinutesField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label htmlFor={id} className={sectionLabelClass('field')}>
        {t('habits.goalMinutesLabel')}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={HABIT_GOAL_MINUTES_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass({ size: 'sm' }, 'w-20 tabular-nums')}
      />
      <span className="text-zinc-500 dark:text-zinc-400">{t('habits.goalMinutesSuffix')}</span>
    </div>
  )
}

/**
 * 習慣の追加・編集で共通の欄: 種類（習慣 / ルーティン）・名前・色（＝ラベル）・頻度（毎日 / 曜日を指定と曜日 / 週に◯回と回数）・時間（「時間を決める」）。
 * 曜日ごとの時間・1 回の目標は「詳しく設定」の中。
 * ルーティンは時間帯だけ・週に◯回と時間の目標なし（`effectiveHabitForm`）。
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
  const routine = form.kind === 'routine'
  const shown = effectiveHabitForm(form)
  return (
    <>
      <div className="space-y-1">
        <RadioChoices
          heading={t('habits.kindHeading')}
          name={`${name}-kind`}
          options={KIND_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
          value={routine ? 'routine' : 'habit'}
          onChange={(kind) => onChange({ kind })}
        />
        <p className={HINT_TEXT}>{t(routine ? 'habits.kindRoutineHint' : 'habits.kindHabitHint')}</p>
      </div>
      <input
        ref={titleRef}
        value={form.title}
        onChange={(e) => onChange({ title: e.target.value })}
        maxLength={TITLE_MAX_LENGTH}
        onKeyDown={(e) => {
          if (isSubmitEnter(e)) {
            e.preventDefault()
            onSubmit()
          }
          if (isCancelEscape(e)) onEscape()
        }}
        placeholder={placeholder}
        className={fieldClass({}, 'w-full')}
      />
      <ColorPicker color={form.color} onPick={(color) => onChange({ color })} />
      <RadioChoices
        heading={t('habits.freqHeading')}
        name={`${name}-frequency`}
        options={(routine ? ROUTINE_FREQ_OPTIONS : FREQ_OPTIONS).map((o) => ({ value: o.value, label: t(o.labelKey) }))}
        value={shown.freq}
        onChange={(freq) => onChange({ freq })}
      />
      {shown.freq === 'weekly' ? (
        <WeekdayPicker weekdays={form.weekdays} onToggle={(v) => onChange({ weekdays: toggleHabitWeekdaySelection(form.weekdays, v) })} />
      ) : null}
      {shown.freq === 'timesPerWeek' ? (
        <TimesPerWeekPicker count={form.timesPerWeek} onChange={(timesPerWeek) => onChange({ timesPerWeek })} />
      ) : null}
      <HabitTimeFields form={shown} onChange={onChange} />
      <AdvancedFields form={shown} onChange={onChange} />
    </>
  )
}
