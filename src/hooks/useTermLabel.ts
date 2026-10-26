import { useTranslation } from 'react-i18next'
import type { Term } from '../lib/schoolTerms'
import { useDateFormat } from './useDateFormat'

/** 学期の見せ方（名前が無ければ期間） */
export function useTermLabel() {
  const { t } = useTranslation()
  const df = useDateFormat()
  return (term: Pick<Term, 'name' | 'termStart' | 'termEnd'>) => {
    const range = `${df.monthDay(term.termStart)}${t('common.timeRangeSeparator')}${df.monthDay(term.termEnd)}`
    return term.name ? t('common.withNote', { title: term.name, note: range }) : range
  }
}
