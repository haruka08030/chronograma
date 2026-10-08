/**
 * 「あと何分」の時間になったときの知らせ（#290）。タブを開いている端末は、ちょうどの時刻に通知と音を 1 回出す。
 * 閉じている端末へは Web Push（`daily-reminders`、5 分ごとの回なので最大 5 分ほど遅れる）。
 *
 * - 同じ終わりの時刻には 1 回だけ（この端末の印 `chronograma-timer-end`。読み込み直しても、タブが 2 つでも出し直さない）
 * - タブで出すのは時間から `LOCAL_LATE_MS` までだけ。開いたときにもう過ぎていたら出さない
 *   （閉じていた間は Web Push が知らせている。浮いているタイマーは「時間です」の見た目になる）
 * - 通知を出したら、その人の全部の購読に「この終わりは知らせた」印（`timer_end_notified_for`）を付け、
 *   ほかの端末へ数分遅れて同じ Web Push が届かないようにする（ポケットのスマホが遅れて鳴らない）
 * - 記録は止めない。通知の「止める」は止め忘れの通知と同じ（`stopTimerFromNotification`）
 */
import i18n from '../i18n/config'
import type { ActiveTimer } from '../store/storeTypes'
import { timerEndDue } from '../../supabase/functions/daily-reminders/schedule.ts'
import { TIMER_END_NOTIFICATION_TAG, trackPageNotification } from './notificationCleanup'

const STATE_KEY = 'chronograma-timer-end'
/** タブで知らせてよい遅れ（裏に回したタブの時計は 1 分ほど遅れることがある） */
export const LOCAL_LATE_MS = 2 * 60_000

function readNotified(): string | null {
  try {
    return localStorage.getItem(STATE_KEY)
  } catch {
    return null
  }
}

function saveNotified(endsAt: string) {
  try {
    localStorage.setItem(STATE_KEY, endsAt)
  } catch {
    /* 保存できなくても知らせる（読み込み直しで出し直す可能性だけ残る） */
  }
}

/** いまタブで知らせるか（終わりを過ぎて `LOCAL_LATE_MS` まで、この終わりにはまだ知らせていない） */
export function timerEndAlertDue(timer: ActiveTimer | null, nowMs: number, notifiedFor: string | null = readNotified()): boolean {
  if (!timer?.endsAt) return false
  const end = Date.parse(timer.endsAt)
  return timerEndDue(timer.endsAt, nowMs, notifiedFor) && nowMs - end < LOCAL_LATE_MS
}

let audio: AudioContext | null = null

/** 音を出せるようにする（ブラウザは操作の中で作った・再開した AudioContext だけ鳴らせる）。終わりを選んだときに呼ぶ */
export function primeTimerChime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    audio ??= new Ctx()
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    audio = null
  }
}

/** 短いやわらかい音を 1 回（2 つの音を重ねずに続ける、全部で 1 秒弱） */
export function playTimerChime(): void {
  primeTimerChime()
  const ctx = audio
  if (!ctx) return
  try {
    const start = ctx.currentTime + 0.02
    for (const [i, freq] of [880, 660].entries()) {
      const at = start + i * 0.35
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.18, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.55)
    }
  } catch {
    /* 鳴らせなくても通知は出す */
  }
}

/** 時間になった通知を出す。出せたら true（通知の許可が無ければ出さない） */
async function showTimerEndNotification(timer: ActiveTimer, onClick: () => void): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return false
  const title = i18n.t('reminders.timerEndTitle', { title: timer.taskTitle })
  const body = i18n.t('reminders.timerEndBody')
  const tag = TIMER_END_NOTIFICATION_TAG
  try {
    // 「止める」は Service Worker の通知でしか付けられない（止め忘れの通知と同じ形・同じ動き）
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) {
      await reg.showNotification(title, {
        body,
        tag,
        icon: '/icons/icon-192.png',
        data: { url: '/?view=planner', timerStartedAt: timer.startedAt },
        actions: [{ action: 'stop-timer', title: i18n.t('reminders.stopTimer') }],
      } as NotificationOptions)
      return true
    }
    const n = new Notification(title, { body, tag })
    trackPageNotification(tag, n)
    n.onclick = () => {
      window.focus()
      onClick()
      n.close()
    }
    return true
  } catch {
    return false
  }
}

export interface TimerEndAlertDeps {
  /** 通知（Service Worker の無いとき）を押した */
  onOpen: () => void
  /** 全部の購読に「この終わりは知らせた」印を付ける（ログイン中だけ。失敗しても数分後に Web Push が重なるだけ） */
  markNotified?: (endsAt: string) => Promise<void> | void
  nowMs?: number
}

/** 時間になっていれば 1 回だけ知らせる。知らせたら true */
export function checkTimerEnd(timer: ActiveTimer | null, deps: TimerEndAlertDeps): boolean {
  const nowMs = deps.nowMs ?? Date.now()
  if (!timer?.endsAt || !timerEndAlertDue(timer, nowMs)) return false
  const endsAt = timer.endsAt
  saveNotified(endsAt)
  playTimerChime()
  void showTimerEndNotification(timer, deps.onOpen).then((shown) => {
    if (shown) void deps.markNotified?.(endsAt)
  })
  return true
}
