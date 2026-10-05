/**
 * 開いている画面と URL のクエリの対応。URL の形は `/?view=<ビュー>` か `/?list=<リスト id>`。
 * 絞り込みがあれば `&tag=<タグ>`・`&color=<#RRGGBB>` を足す。
 * それ以外のクエリ（Google の OAuth の `code`・`state` など）とハッシュ（Supabase のログイン）は触らない
 */
import type { SmartView } from '../store/storeTypes'

export const SMART_VIEWS: readonly SmartView[] = [
  'planner',
  'all',
  'today',
  'upcoming',
  'overdue',
  'calendar',
  'stats',
  'habits',
  'completed',
  'archived',
  'deleted',
  'settings',
]

/** 統合した旧画面へのリンクは統合先で開く（記録→今日、予定と記録→カレンダー） */
const VIEW_ALIASES: Record<string, SmartView> = {
  'activity-log': 'planner',
  'plan-vs-actual': 'calendar',
}

/** URL が持つ画面の状態のクエリ名 */
const NAV_KEYS = ['view', 'list', 'tag', 'color'] as const

export function toSmartView(raw: string | null | undefined): SmartView | null {
  if (!raw) return null
  const view = Object.prototype.hasOwnProperty.call(VIEW_ALIASES, raw) ? VIEW_ALIASES[raw] : raw
  return (SMART_VIEWS as readonly string[]).includes(view) ? (view as SmartView) : null
}

/** どの画面を開いているか（ストアの `selectedView`・`selectedListId`・`filterTag`・`filterColor`） */
export interface ViewLocation {
  view: SmartView | null
  listId: string | null
  tag: string | null
  color: string | null
}

/** クエリから画面を読む。画面の指定が無い・読めなければ null */
export function parseViewUrl(search: string): ViewLocation | null {
  const params = new URLSearchParams(search)
  const listId = params.get('list') || null
  const view = listId ? null : toSmartView(params.get('view'))
  if (!listId && !view) return null
  const color = params.get('color')
  return {
    view,
    listId,
    tag: params.get('tag') || null,
    color: color && /^#?[0-9a-f]{6}$/i.test(color) ? `#${color.replace(/^#/, '').toUpperCase()}` : null,
  }
}

/** 画面を表すクエリだけ（比べるのにも使う）。ビューもリストも無ければ空 */
export function viewQuery(loc: ViewLocation): string {
  const params = new URLSearchParams()
  if (loc.view) params.set('view', loc.view)
  else if (loc.listId) params.set('list', loc.listId)
  else return ''
  if (loc.tag) params.set('tag', loc.tag)
  if (loc.color) params.set('color', loc.color)
  return params.toString()
}

/** 今の検索部分の画面のクエリを `loc` に置き換えた検索部分（`?` 付き、何も無ければ空）。ほかのクエリは残す */
export function withViewQuery(search: string, loc: ViewLocation): string {
  const params = new URLSearchParams(search)
  for (const key of NAV_KEYS) params.delete(key)
  const rest = params.toString()
  const nav = viewQuery(loc)
  const query = [nav, rest].filter(Boolean).join('&')
  return query ? `?${query}` : ''
}
