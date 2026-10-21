/** Notion の連携の設定（どのステータスを要アクションにし、完了でどこへ進めるか） */
export type NotionConfig = {
  statusProperty: string | null
  dateProperty: string | null
  actionStatuses: string[]
  /** 完了にしたときの進め先。キーは要アクションのステータス */
  nextStatus: Record<string, string>
}

export type SchemaProperty = { name: string; type: string; options?: string[] }

/** クライアントから来た設定を、今のスキーマに合うものだけ残して受け入れる */
export function sanitizeConfig(raw: unknown, schema: SchemaProperty[]): NotionConfig {
  const c = (raw ?? {}) as Partial<NotionConfig>
  const statusProp = schema.find((p) => p.name === c.statusProperty && (p.type === 'status' || p.type === 'select'))
  const options = new Set(statusProp?.options ?? [])
  const dateProp = schema.find((p) => p.name === c.dateProperty && p.type === 'date')
  const actionStatuses = Array.isArray(c.actionStatuses)
    ? [...new Set(c.actionStatuses.filter((s): s is string => typeof s === 'string' && options.has(s)))]
    : []
  const nextStatus: Record<string, string> = {}
  for (const [from, to] of Object.entries(c.nextStatus ?? {})) {
    if (actionStatuses.includes(from) && typeof to === 'string' && options.has(to) && to !== from) {
      nextStatus[from] = to
    }
  }
  return {
    statusProperty: statusProp?.name ?? null,
    dateProperty: dateProp?.name ?? null,
    actionStatuses,
    nextStatus,
  }
}

/**
 * 保存してある設定が、今のデータベースと合わなくなったか（Notion でステータスの列・選択肢の名前を変えた・消した）。
 * 合わないまま取り込むと、名前が変わったステータスの To-Do が「要アクションでなくなった」に見えて黙って完了になるので、
 * 取り込みでは自動の完了をやめて、設定を見直してもらう
 */
export function configDrifted(raw: unknown, schema: SchemaProperty[]): boolean {
  const c = (raw ?? {}) as Partial<NotionConfig>
  const clean = sanitizeConfig(raw, schema)
  if (typeof c.statusProperty === 'string' && clean.statusProperty === null) return true
  if (typeof c.dateProperty === 'string' && clean.dateProperty === null) return true
  const wanted = Array.isArray(c.actionStatuses) ? c.actionStatuses.filter((s) => typeof s === 'string') : []
  if (wanted.some((s) => !clean.actionStatuses.includes(s))) return true
  for (const [from, to] of Object.entries(c.nextStatus ?? {})) {
    if (clean.actionStatuses.includes(from) && to !== from && clean.nextStatus[from] !== to) return true
  }
  return false
}
