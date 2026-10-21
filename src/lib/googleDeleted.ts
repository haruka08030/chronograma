import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { askConfirm } from './confirmDialog'
import { shouldBeOnGoogle } from './googlePush'
import { googleSkipKeys } from './googleSkip'

/**
 * Google で消されたアプリの予定を、アプリでもゴミ箱に入れる（#494。アプリを Google に合わせる。30 日は戻せる）。
 * 入れるのは Google に置いている予定だけ（To-Do・記録・睡眠は触らない）。
 * 一度に多く消えていたら（カレンダーごと消したなど）、入れる前に確かめる。断られた予定は、開いている間はもう聞かない
 */

/** これより多いときは確かめる */
export const ASK_OVER = 5

const declined = new Set<string>()
/** 確かめている間に次が来ても、ダイアログを重ねない */
let running: Promise<number> = Promise.resolve(0)

type Options = {
  /** まだ Google に送っていない予定（アプリで戻した・直したばかりのものは消さない） */
  pending?: ReadonlySet<string>
  /** Google で消された時刻（予定の ID → ISO）。アプリでそれより後に直した予定（ほかの端末でゴミ箱から戻したなど）は消さない */
  deletedAt?: ReadonlyMap<string, string>
}

/** ゴミ箱に入れる予定（Google に置いているもので、消された後にアプリで変えていないもの） */
function targets(taskIds: Iterable<string>, { pending, deletedAt }: Options): string[] {
  const s = useTaskStore.getState()
  const want = new Set(taskIds)
  const skip = googleSkipKeys(s.addons.googleSkip)
  return s.tasks
    .filter((t) => {
      if (!want.has(t.id) || pending?.has(t.id) || declined.has(t.id) || !shouldBeOnGoogle(t, skip)) return false
      const at = deletedAt?.get(t.id)
      return !at || Date.parse(t.updatedAt) <= Date.parse(at)
    })
    .map((t) => t.id)
}

/** Google で消された予定（アプリの予定の ID）をゴミ箱に入れ、入れた数を返す */
export function trashGoogleDeleted(taskIds: readonly string[], options: Options = {}): Promise<number> {
  const next = running.then(async () => {
    let ids = targets(taskIds, options)
    if (ids.length === 0) return 0
    if (ids.length > ASK_OVER) {
      const ok = await askConfirm({
        message: i18n.t('googleDeleted.confirm', { count: ids.length }),
        confirmLabel: i18n.t('googleDeleted.confirmAction'),
      })
      if (!ok) {
        ids.forEach((id) => declined.add(id))
        return 0
      }
      // 確かめている間に変わったかもしれない
      ids = targets(ids, options)
      if (ids.length === 0) return 0
    }
    useTaskStore.getState().deleteTasks(ids, { key: 'googleDeleted.moved', params: { count: ids.length } })
    return ids.length
  })
  running = next.catch(() => 0)
  return next
}
