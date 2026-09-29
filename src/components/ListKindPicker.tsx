import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { LIST_KINDS, type ListKind, type TaskList } from '../types/list'

/** リスト見出しの右に置く「種類」切り替え（やること / いつか / チェックリスト） */
export function ListKindPicker({ list }: { list: TaskList }) {
  const { t } = useTranslation()
  const setListKind = useTaskStore((s) => s.setListKind)
  const kind = list.kind ?? 'tasks'
  return (
    <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400" title={t(`listKind.${kind}Help`)}>
      <span className="sr-only md:not-sr-only">{t('listKind.label')}</span>
      <select
        value={kind}
        onChange={(e) => setListKind(list.id, e.target.value as ListKind)}
        className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none focus:border-accent-400
                   dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
      >
        {LIST_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`listKind.${k}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
