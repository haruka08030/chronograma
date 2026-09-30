import { format } from 'date-fns'
import i18n from '../i18n/config'
import type { DailyReminders } from '../store/taskStore'
import { timeToMinutes } from './timeGrid'

const FIRED_KEY = 'chronograma-daily-reminders-fired'
/** 指定時刻からこの分数を過ぎたら、その日はもう出さない（夜にアプリを開いて朝の通知が出る、を防ぐ） */
const GRACE_MINUTES = 60

type Kind = 'plan' | 'wrapUp'

function readFired(): Partial<Record<Kind, string>> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? '{}') as Partial<Record<Kind, string>>
  } catch {
    return {}
  }
}

function markFired(kind: Kind, dateKey: string) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify({ ...readFired(), [kind]: dateKey }))
  } catch {
    /* ストレージ不可でも通知自体は出す */
  }
}

function isDue(time: string | null, now: Date): boolean {
  if (!time) return false
  const diff = now.getHours() * 60 + now.getMinutes() - timeToMinutes(time)
  return diff >= 0 && diff < GRACE_MINUTES
}

/**
 * 朝の「今日を計画しましょう」と夕方の「1 日を締めましょう」を 1 日 1 回ずつ出す。
 * ブラウザ通知なのでアプリ（タブ）が開いている間だけ届く。
 */
export function checkDailyReminders(
  reminders: DailyReminders,
  ctx: { remainingToday: number; onOpen: () => void },
  now = new Date(),
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  const today = format(now, 'yyyy-MM-dd')
  const fired = readFired()

  const show = (kind: Kind, title: string, body: string) => {
    markFired(kind, today)
    const n = new Notification(title, { body, tag: `chronograma-${kind}` })
    n.onclick = () => {
      window.focus()
      ctx.onOpen()
      n.close()
    }
  }

  if (fired.plan !== today && isDue(reminders.planTime, now)) {
    show('plan', i18n.t('reminders.planTitle'), i18n.t('reminders.planBody'))
  }
  if (fired.wrapUp !== today && isDue(reminders.wrapUpTime, now)) {
    show(
      'wrapUp',
      i18n.t('reminders.wrapUpTitle'),
      ctx.remainingToday > 0
        ? i18n.t('reminders.wrapUpBodyRemaining', { count: ctx.remainingToday })
        : i18n.t('reminders.wrapUpBodyClear'),
    )
  }
}
