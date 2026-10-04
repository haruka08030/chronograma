import i18n from '../i18n/config'
import type { BackupProblem } from './backupFormat'

/** 例として出す名前は長いと通知からはみ出すので切る */
const EXAMPLE_MAX = 20

function shorten(text: string): string {
  return text.length > EXAMPLE_MAX ? `${text.slice(0, EXAMPLE_MAX)}…` : text
}

/** バックアップを取り込めない理由を、通知に出す短い文にする */
export function backupProblemText(problem: BackupProblem): string {
  switch (problem.kind) {
    case 'notJson':
    case 'notBackup':
      return i18n.t(`backupProblem.${problem.kind}`)
    case 'newerVersion':
      return i18n.t('backupProblem.newerVersion', { version: problem.version })
    case 'missingFields':
      return i18n.t(`backupProblem.missingFields_${problem.item}`, { count: problem.count })
    case 'duplicateIds':
    case 'missingList':
      return i18n.t(`backupProblem.${problem.kind}_${problem.item}`, {
        count: problem.count,
        example: shorten(problem.example),
      })
    case 'missingSection':
    case 'missingParent':
      return i18n.t(`backupProblem.${problem.kind}`, {
        count: problem.count,
        example: shorten(problem.example),
      })
  }
}
