import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { googleMapsUrl } from '../../lib/linkify'
import { tip } from '../../lib/tooltip'
import { MapPinIcon } from '../icons'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { LOCATION_MAX_LENGTH } from '../../lib/textLimits'
import { useDraftField } from '../../hooks/useDraftField'

/** タスク詳細の場所。書いてあれば地図で開くリンク */
export function TaskLocationField({ task }: { task: Task }) {
  const { t } = useTranslation()
  const updateTask = useTaskStore((s) => s.updateTask)
  // 打つたびにストアを変えず、止まったら・離れたら保存する（#266）
  const place = useDraftField(task.location ?? '', (v) => updateTask(task.id, { location: v || null }), task.id)
  return (
    <div>
      <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.location')}</label>
      <div className="flex items-center gap-2">
        <input
          value={place.value}
          onChange={(e) => place.change(e.target.value)}
          onBlur={place.flush}
          maxLength={LOCATION_MAX_LENGTH}
          placeholder={t('taskDetail.locationPlaceholder')}
          className={fieldClass({}, 'min-w-0 flex-1')}
        />
        {place.value.trim() && (
          <a
            href={googleMapsUrl(place.value)}
            target="_blank"
            rel="noopener noreferrer"
            {...tip(t('taskDetail.openInMaps'), { name: true })}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700
                         text-accent-600 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-500/10
                         transition-colors flex-shrink-0"
          >
            <MapPinIcon className="w-4 h-4" />
            <span className="hidden sm:inline">{t('taskDetail.openInMaps')}</span>
          </a>
        )}
      </div>
    </div>
  )
}
