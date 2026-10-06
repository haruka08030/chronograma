import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { GOOGLE_COLOR_HEXES } from '../../lib/googleColors'
import type { Task } from '../../types/task'
import { displayListName } from '../../lib/displayListName'
import { colorVars } from '../../lib/logCategoryColors'
import { ColorLabelPicker } from '../labels/ColorLabelPicker'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'

/** タスク詳細のリスト（移すとトースト）・色（＝ラベル）・セクション（ルートのタスクで、リストにセクションがあるときだけ） */
export function TaskListFields({ task }: { task: Task }) {
  const { t } = useTranslation()
  const updateTask = useTaskStore((s) => s.updateTask)
  const lists = useTaskStore((s) => s.lists)
  const moveTaskToList = useTaskStore((s) => s.moveTaskToList)
  const showMoveBanner = useTaskStore((s) => s.showMoveBanner)
  const sections = useTaskStore((s) => s.sections)
  const sectionsForTaskList = useMemo(
    () => sections.filter((s) => s.listId === task.listId).sort((a, b) => a.order - b.order),
    [sections, task.listId],
  )
  return (
    <div>
      <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.list')}</label>
      <div className="flex items-center gap-2">
        <span
          className="gc-dot w-3 h-3 rounded-full flex-shrink-0"
          style={colorVars(lists.find((l) => l.id === task.listId)?.color ?? GOOGLE_COLOR_HEXES[0])}
        />
        <select
          value={task.listId}
          onChange={(e) => {
            const next = e.target.value
            const r = moveTaskToList(task.id, next)
            if (r.moved && r.listName) {
              showMoveBanner(
                t('toast.taskMovedToList', {
                  name: displayListName(r.listId ?? next, r.listName),
                }),
              )
            }
          }}
          className={fieldClass({}, 'min-w-0 flex-1')}
        >
          {lists
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {displayListName(l.id, l.name)}
              </option>
            ))}
        </select>
      </div>
      {/* 色＝ラベル（記録と同じ）。カレンダーの色と To‑Do の色ラベルに使う。既定はリストの色。
              見出しは付けない（ボタンに色とラベル名が出るので重ねない） */}
      <div className="mt-3">
        <ColorLabelPicker task={task} plan />
      </div>
      {!task.parentId && sectionsForTaskList.length > 0 && (
        <div className="mt-3">
          <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.section')}</label>
          <select
            value={task.sectionId ?? ''}
            onChange={(e) => {
              const v = e.target.value
              updateTask(task.id, { sectionId: v === '' ? null : v })
            }}
            className={fieldClass({}, 'w-full')}
          >
            <option value="">{t('taskDetail.sectionNone')}</option>
            {sectionsForTaskList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
