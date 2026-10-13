import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import type { ActionEntry } from './ActionMenu'
import { ColorDot, type FilterChip } from './FilterChips'
import { colorLabelText } from '../../lib/todoColorLabels'
import { displayListName } from '../../lib/displayListName'
import { formatDuration } from '../../lib/timeGrid'
import {
  ESTIMATE_FILTERS,
  PRIORITY_FILTERS,
  type EstimateFilter,
  type PriorityFilter,
  type TaskFilter,
  type TaskFilterKey,
} from '../../lib/taskFilter'

/** 絞り込みの中のメニュー（「優先度で絞る ›」など）: 先頭に「指定なし」、続けて選べる値。右に今の値 */
export function filterSub<V>({
  id,
  label,
  anyLabel,
  values,
  current,
  onPick,
}: {
  id: string
  label: string
  anyLabel: string
  values: { value: V; label: string; icon?: ReactNode }[]
  current: V | null
  onPick: (value: V | null) => void
}): ActionEntry {
  return {
    kind: 'sub',
    id,
    label,
    hint: values.find((v) => v.value === current)?.label,
    leaves: [
      { id: `${id}-any`, label: anyLabel, checked: current === null, run: () => onPick(null) },
      ...values.map((v) => ({
        id: `${id}-${String(v.value)}`,
        label: v.label,
        icon: v.icon,
        checked: current === v.value,
        run: () => onPick(v.value),
      })),
    ],
  }
}

/**
 * To-Do の絞り込みのメニューとチップ（じょうごのボタンに渡す）。`keys` の項目だけ出す。
 * リスト・ラベル・タグは `pool` にあるものだけ（リストは 2 つ以上あるときだけ。1 つなら絞っても変わらない）。選んでいる値は消さない
 */
export function useTaskFilterMenu({
  filter,
  setFilter,
  keys,
  pool,
}: {
  filter: Partial<TaskFilter>
  setFilter: (patch: Partial<TaskFilter>) => void
  keys: readonly TaskFilterKey[]
  pool: readonly Task[]
}) {
  const { t } = useTranslation()
  const lists = useTaskStore((s) => s.lists)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const categoryColors = useTaskStore((s) => s.logCategoryColors)

  const options = useMemo(() => {
    const listIds = new Set<string>()
    const colors = new Set<string>()
    const tags = new Set<string>()
    for (const task of pool) {
      listIds.add(task.listId)
      if (task.color) colors.add(task.color.toUpperCase())
      for (const tag of task.tags) tags.add(tag)
    }
    return { listIds, colors: [...colors], tags: [...tags].sort((a, b) => a.localeCompare(b, 'ja')) }
  }, [pool])

  const listName = (id: string) => {
    const list = lists.find((l) => l.id === id)
    return list ? displayListName(list.id, list.name) : id
  }
  const colorName = (hex: string) => colorLabelText(hex, presets, categoryColors, t)
  const priorityName = (p: PriorityFilter) => t(p === 'high' ? 'filter.priorityHigh' : 'filter.priorityMedium')
  const estimateName = (e: EstimateFilter) =>
    e === 'set' ? t('filter.estimateSet') : t('filter.estimateWithin', { time: formatDuration(e) })

  const sub = <K extends TaskFilterKey>(key: K, values: { value: NonNullable<TaskFilter[K]>; label: string; icon?: ReactNode }[]) =>
    filterSub({
      id: key,
      label: t(`filter.by.${key}`),
      anyLabel: t('filter.any'),
      values,
      current: (filter[key] ?? null) as NonNullable<TaskFilter[K]> | null,
      onPick: (value) => setFilter({ [key]: value }),
    })

  const withCurrent = <T,>(values: T[], current: T | null | undefined) =>
    current && !values.includes(current) ? [...values, current] : values

  const entries: ActionEntry[] = []
  for (const key of keys) {
    if (key === 'listId') {
      if (options.listIds.size < 2 && !filter.listId) continue
      entries.push(
        sub(
          'listId',
          lists
            .filter((l) => options.listIds.has(l.id) || l.id === filter.listId)
            .map((l) => ({ value: l.id, label: displayListName(l.id, l.name) })),
        ),
      )
    } else if (key === 'color') {
      const colors = withCurrent(options.colors, filter.color)
      if (colors.length === 0) continue
      entries.push(
        sub(
          'color',
          colors
            .map((hex) => ({ value: hex, label: colorName(hex), icon: <ColorDot hex={hex} /> }))
            .sort((a, b) => a.label.localeCompare(b.label, 'ja')),
        ),
      )
    } else if (key === 'tag') {
      const tags = withCurrent(options.tags, filter.tag)
      if (tags.length === 0) continue
      entries.push(
        sub(
          'tag',
          tags.map((tag) => ({ value: tag, label: tag })),
        ),
      )
    } else if (key === 'priority') {
      entries.push(
        sub(
          'priority',
          PRIORITY_FILTERS.map((p) => ({ value: p, label: priorityName(p) })),
        ),
      )
    } else {
      entries.push(
        sub(
          'estimate',
          ESTIMATE_FILTERS.map((e) => ({ value: e, label: estimateName(e) })),
        ),
      )
    }
  }

  const remove = (key: TaskFilterKey) => () => setFilter({ [key]: null })
  const chips: FilterChip[] = []
  if (filter.listId) chips.push({ key: 'listId', label: listName(filter.listId), onRemove: remove('listId') })
  if (filter.color)
    chips.push({ key: 'color', label: colorName(filter.color), icon: <ColorDot hex={filter.color} />, onRemove: remove('color') })
  if (filter.tag) chips.push({ key: 'tag', label: filter.tag, onRemove: remove('tag') })
  if (filter.priority)
    chips.push({ key: 'priority', label: t('filter.priorityChip', { value: priorityName(filter.priority) }), onRemove: remove('priority') })
  if (filter.estimate) chips.push({ key: 'estimate', label: estimateName(filter.estimate), onRemove: remove('estimate') })

  /** 選んでいる絞り込みを全部外す */
  const clear = () => setFilter(Object.fromEntries(keys.map((k) => [k, null])))

  return { entries, chips, clear }
}
