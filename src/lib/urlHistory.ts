/**
 * 開いている画面をブラウザの履歴と URL に載せる（`?view=` / `?list=`。形は `viewUrl.ts`）。
 * 画面の状態の持ち主はストアのまま。URL はその写しで、ブラウザ・Android の「戻る」で前の画面に戻れる
 */
import { useTaskStore } from '../store/taskStore'
import type { TaskState } from '../store/storeTypes'
import { parseViewUrl, viewQuery, withViewQuery, type ViewLocation } from './viewUrl'

function locationOf(s: TaskState): ViewLocation {
  return {
    view: s.selectedView,
    listId: s.selectedView ? null : s.selectedListId,
    tag: s.filterTag,
    color: s.filterColor,
  }
}

/** URL の画面をストアに入れる（ストアの `selectList` / `selectView` / `selectColor` と同じ項目を替える） */
function applyLocation(loc: ViewLocation) {
  const common = { quickAddSectionId: null, settingsScrollTarget: null, filterTag: loc.tag }
  if (loc.listId) {
    useTaskStore.setState({ ...common, selectedListId: loc.listId, selectedView: null, filterColor: null })
  } else if (loc.view) {
    useTaskStore.setState({ ...common, selectedView: loc.view, selectedListId: null, filterColor: loc.color })
  }
}

/**
 * 起動時に URL の画面を開き、以後はストアの画面が替わるたびに履歴を積む。`popstate`（戻る・進む）では URL の画面を開く。
 * - 最初の履歴と、戻る・進むで開いた画面の書き直しは `replaceState`（履歴を増やさない）
 * - リストの削除・同期でリストが消えて開き直したときも `replaceState`（戻ると消えたリストになるので）
 * - 積むときの URL は画面のクエリだけ。置き換えるときはほかのクエリ（OAuth の戻り）とハッシュ（Supabase のログイン）を残す
 */
export function setupUrlHistory() {
  if (typeof window === 'undefined') return
  const initial = parseViewUrl(window.location.search)
  if (initial && viewQuery(initial) !== viewQuery(locationOf(useTaskStore.getState()))) applyLocation(initial)

  let shown = ''
  let fromPopState = false
  const write = (s: TaskState, mode: 'push' | 'replace') => {
    const loc = locationOf(s)
    shown = viewQuery(loc)
    const { pathname, search, hash } = window.location
    if (mode === 'replace') window.history.replaceState(window.history.state, '', pathname + withViewQuery(search, loc) + hash)
    else window.history.pushState(null, '', pathname + withViewQuery('', loc))
  }
  write(useTaskStore.getState(), 'replace')

  useTaskStore.subscribe((s, prev) => {
    if (viewQuery(locationOf(s)) === shown) return
    write(s, fromPopState || s.lists !== prev.lists ? 'replace' : 'push')
  })

  window.addEventListener('popstate', () => {
    const loc = parseViewUrl(window.location.search)
    if (!loc) return
    shown = viewQuery(loc)
    fromPopState = true
    try {
      // 戻った先のリストがもう無ければ To-Do の「すべて」を開く
      const gone = loc.listId !== null && !useTaskStore.getState().lists.some((l) => l.id === loc.listId)
      applyLocation(gone ? { view: 'all', listId: null, tag: null, color: null } : loc)
    } finally {
      fromPopState = false
    }
  })
}
