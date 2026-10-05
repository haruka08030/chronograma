import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { LIST_KINDS, type ListKind, type TaskList } from '../types/list'
import { fieldClass } from './ui/fieldClass'

/** リスト見出しの右に置く「種類」切り替え（やること / いつか / チェックリスト） */
export function ListKindPicker({ list }: { list: TaskList }) {
  const { t } = useTranslation()
  const setListKind = useTaskStore((s) => s.setListKind)
  const kind = list.kind ?? 'tasks'
  return (
    <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400" title={t(`listKind.${kind}Help`)}>
      <span className="sr-only md:not-sr-only">{t('listKind.label')}</span>
      <select value={kind} onChange={(e) => setListKind(list.id, e.target.value as ListKind)} className={fieldClass({ size: 'sm' })}>
        {LIST_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`listKind.${k}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
