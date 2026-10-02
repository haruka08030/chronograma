export interface ListSection {
  id: string
  listId: string
  name: string
  order: number
  /** 最後に変えた ISO 時刻。同期でどちらの端末の変更を残すかに使う。未設定（古いデータ）は最古扱い */
  updatedAt?: string
}
