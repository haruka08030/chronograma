import { useTranslation } from 'react-i18next'
import { useTaskStore, type SmartView } from '../../store/taskStore'
import { displayListName } from '../../lib/displayListName'
import { ActionMenu, type ActionEntry } from '../ui/ActionMenu'

const VIEWS: SmartView[] = ['all', 'today', 'upcoming', 'overdue']

/**
 * スマホの To-Do の題名を押すと出る、絞り込み・リストの切り替え（Google Tasks の題名のメニューと同じ）。
 * ドロワー（その他 → To-Do）まで行かずに「買い物」などを開ける
 */
export function TodoSwitcherMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const { t } = useTranslation()
  const lists = useTaskStore((s) => s.lists)
  const selectedView = useTaskStore((s) => s.selectedView)
  const selectedListId = useTaskStore((s) => s.selectedListId)
  const filterColor = useTaskStore((s) => s.filterColor)
  const selectView = useTaskStore((s) => s.selectView)
  const selectList = useTaskStore((s) => s.selectList)

  const entries: ActionEntry[] = [
    ...VIEWS.map((v): ActionEntry => ({
      kind: 'leaf',
      id: `view-${v}`,
      label: t(`sidebar.views.${v}`),
      checked: selectedView === v && !(v === 'all' && filterColor),
      run: () => selectView(v),
    })),
    ...[...lists]
      .sort((a, b) => a.order - b.order)
      .map((l, i): ActionEntry => ({
        kind: 'leaf',
        id: `list-${l.id}`,
        divider: i === 0,
        label: displayListName(l.id, l.name),
        icon: <span className="mx-[3px] h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: l.color }} />,
        checked: selectedView === null && selectedListId === l.id,
        run: () => selectList(l.id),
      })),
  ]
  return <ActionMenu x={x} y={y} entries={entries} onClose={onClose} searchable={false} />
}
