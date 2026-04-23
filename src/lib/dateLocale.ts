import { enUS, ja } from 'date-fns/locale'
import i18n from '../i18n/config'

export function dateLocale() {
  return i18n.language.startsWith('en') ? enUS : ja
}
