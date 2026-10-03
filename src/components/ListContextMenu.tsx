import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { LIST_KINDS } from '../types/list'
import { ActionMenu, type ActionEntry } from './ui/ActionMenu'
import { ColorSwatches } from './ui/ColorSwatches'
import { CartIcon, CheckIcon, PencilIcon, StarIcon, TrashIcon } from './icons'

const ICON = 'h-4 w-4 flex-shrink-0'
const KIND_ICON = {
  tasks: <CheckIcon className={ICON} />,
  someday: <StarIcon className={ICON} strokeWidth={1.75} />,
  checklist: <CartIcon className={ICON} strokeWidth={1.75} />,
}

/**
 * サイドバーのリストを右クリックしたときのメニュー（名前の変更・色・種類・削除）。
 * 色は行の丸を押しても選べる。削除は確認なしで消して「元に戻す」で戻せる
 */
export function ListContextMenu({ x, y, listId, onClose, onRename }: {
  x: number
  y: number
  listId: string
  onClose: () => void
  onRename: () => void
}) {
  const { t } = useTranslation()
  const list = useTaskStore((s) => s.lists.find((l) => l.id === listId) ?? null)
  const updateListColor = useTaskStore((s) => s.updateListColor)
  const setListKind = useTaskStore((s) => s.setListKind)
  const deleteList = useTaskStore((s) => s.deleteList)
  if (!list) return null
  const kind = list.kind ?? 'tasks'
  const entries: ActionEntry[] = [
    { kind: 'leaf', id: 'rename', label: t('sidebar.renameList'), icon: <PencilIcon className={ICON} strokeWidth={1.75} />, run: onRename },
    {
      kind: 'sub',
      id: 'color',
      label: t('sidebar.listColorDialog'),
      icon: <span className="mx-px h-3.5 w-3.5 flex-shrink-0 rounded-full" style={{ backgroundColor: list.color }} aria-hidden />,
      leaves: [],
      extra: (close) => (
        <ColorSwatches
          ariaLabel={t('sidebar.listColorDialog')}
          columns={6}
          selectedHex={list.color}
          onChoose={(hex) => {
            updateListColor(list.id, hex)
            close()
          }}
        />
      ),
    },
    {
      kind: 'sub',
      id: 'kind',
      label: t('listKind.label'),
      icon: KIND_ICON[kind],
      leaves: LIST_KINDS.map((k) => ({
        id: `kind-${k}`,
        label: t(`listKind.${k}`),
        icon: KIND_ICON[k],
        checked: kind === k,
        run: () => setListKind(list.id, k),
      })),
    },
    { kind: 'leaf', id: 'delete', divider: true, label: t('sidebar.deleteList'), icon: <TrashIcon className={ICON} />, danger: true, run: () => deleteList(list.id) },
  ]
  return <ActionMenu x={x} y={y} header={list.name} entries={entries} onClose={onClose} searchable={false} />
}
