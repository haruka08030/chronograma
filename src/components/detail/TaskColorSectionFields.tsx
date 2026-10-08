import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { ColorLabelPicker } from '../labels/ColorLabelPicker'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { compareByOrder } from '../../lib/orderCompare'

/**
 * タスク詳細の色（＝ラベル）・セクション（ルートのタスクで、リストにセクションがあるときだけ）。
 * リストは詳細では変えない（メニューの「移動先」・ナビへのドラッグで移す）
 */
export function TaskColorSectionFields({ task }: { task: Task }) {
  const { t } = useTranslation()
  const updateTask = useTaskStore((s) => s.updateTask)
  const sections = useTaskStore((s) => s.sections)
  const sectionsForTaskList = useMemo(() => sections.filter((s) => s.listId === task.listId).sort(compareByOrder), [sections, task.listId])
  return (
    <div>
      {/* 色＝ラベル（記録と同じ）。カレンダーの色と To‑Do の色ラベルに使う。既定はリストの色。
              見出しは付けない（ボタンに色とラベル名が出るので重ねない） */}
      <ColorLabelPicker task={task} plan />
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
