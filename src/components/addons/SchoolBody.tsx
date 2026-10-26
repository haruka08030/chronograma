import { useTranslation } from 'react-i18next'
import { TimetableBody } from '../calendar/TimetableDialog'
import { AbsencesBody } from './AbsencesBody'
import { CARD_TITLE_CLASS } from '../ui/headingClass'
import { HINT_TEXT } from '../ui/textClass'

/** 追加機能「学校」のページ（#617）。時間割と授業の欠席の一覧を 1 ページに並べる */
export function SchoolBody() {
  const { t } = useTranslation()
  return (
    <>
      <section aria-labelledby="school-timetable">
        <h2 id="school-timetable" className={CARD_TITLE_CLASS}>
          {t('timetable.title')}
        </h2>
        <p className={`mt-0.5 ${HINT_TEXT}`}>{t('timetable.intro')}</p>
        <div className="mt-2">
          <TimetableBody />
        </div>
      </section>
      <section aria-labelledby="school-absences">
        <h2 id="school-absences" className={CARD_TITLE_CLASS}>
          {t('absences.title')}
        </h2>
        <div className="-mx-2 mt-1">
          <AbsencesBody />
        </div>
      </section>
    </>
  )
}
