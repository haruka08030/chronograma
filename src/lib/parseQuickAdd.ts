import { addDays, format, isValid, parseISO, startOfDay } from 'date-fns'

export type ParsedQuickAdd = {
  title: string
  dueDate: string | null
  tags: string[]
}

function normalizeToken(t: string): string {
  return t.trim()
}

/**
 * 末尾から #tag と日付キーワード（today / tomorrow / 今日 / 明日 / yyyy-MM-dd）を解釈する。
 */
export function parseQuickAddTitle(raw: string, localeJa: boolean): ParsedQuickAdd {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { title: raw.trim(), dueDate: null, tags: [] }

  const tags: string[] = []
  let dueDate: string | null = null
  const today = startOfDay(new Date())

  const dateKeywords = new Map<string, Date>([
    ['today', today],
    ['tomorrow', addDays(today, 1)],
  ])
  if (localeJa) {
    dateKeywords.set('今日', today)
    dateKeywords.set('明日', addDays(today, 1))
  }

  while (parts.length > 0) {
    const last = parts[parts.length - 1]!
    const low = last.toLowerCase()
    if (last.startsWith('#') && last.length > 1) {
      const name = normalizeToken(last.slice(1))
      if (name && !tags.includes(name)) tags.unshift(name)
      parts.pop()
      continue
    }
    if (dateKeywords.has(last) || dateKeywords.has(low)) {
      const d = dateKeywords.get(last) ?? dateKeywords.get(low)
      if (d) dueDate = format(startOfDay(d), 'yyyy-MM-dd')
      parts.pop()
      continue
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(last)) {
      const d = parseISO(last + 'T12:00:00')
      if (isValid(d)) {
        dueDate = format(startOfDay(d), 'yyyy-MM-dd')
        parts.pop()
        continue
      }
    }
    break
  }

  const title = parts.join(' ').trim() || raw.trim()
  return { title, dueDate, tags }
}
