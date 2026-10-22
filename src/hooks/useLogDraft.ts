import { useRef, useState } from 'react'
import { useTaskStore } from '../store/taskStore'
import { withInferredCategory } from '../store/storeDefaults'
import type { LogSuggestion } from '../lib/logSuggestions'
import type { LogLabel } from '../lib/logCategoryColors'

/** 打った名前から推定したラベル（保存のときの推定と同じ `withInferredCategory`）。無ければ '' */
function inferLabel(title: string): string {
  return withInferredCategory([], useTaskStore.getState(), title.trim())[0] ?? ''
}

/**
 * 記録の名前とラベルの下書き。名前を打つたびに推定したラベルを先に選んでおく（保存したら付くラベルを先に見せる）。
 * 自分でラベルを選んだ・外したら、それからは名前を変えても上書きしない。
 * 候補を選ぶと名前とその記録のラベルが入る。`infer: false` は記録でない欄（同じ欄で To-Do も作るカード）
 */
export function useLogDraft({ infer = true }: { infer?: boolean } = {}) {
  const [title, setTitleValue] = useState('')
  const [category, setCategoryValue] = useState('')
  /** ラベルの欄で選んだ名前の無い色（null は外した、undefined はまだ選んでいない） */
  const [pickedColor, setPickedColor] = useState<string | null | undefined>(undefined)
  /** 自分でラベルを選んだ（外した）か */
  const chosen = useRef(false)
  /** 選んだ予定・To-Do（紐づける To-Do と、ラベル名の無い予定の色）。名前を変えたら外す */
  const [link, setLink] = useState<{ title: string; taskId: string | null; color: string | null } | null>(null)
  const linked = link && link.title === title ? link : null
  return {
    title,
    category,
    /** 選んだ予定・To-Do に紐づける To-Do */
    taskId: linked?.taskId ?? null,
    /** ラベルが無いときに記録に付ける色（自分で選んだ色 → 選んだ予定の色） */
    color: category ? null : pickedColor !== undefined ? pickedColor : (linked?.color ?? null),
    setTitle: (v: string) => {
      setTitleValue(v)
      if (infer && !chosen.current) setCategoryValue(inferLabel(v))
    },
    /** ラベルの欄で選んだ（分類か、名前の無い色か、ラベルなし） */
    setLabel: (v: LogLabel) => {
      chosen.current = true
      setCategoryValue(v.tags[0] ?? '')
      setPickedColor(v.color)
    },
    pick: (s: LogSuggestion) => {
      setTitleValue(s.title)
      setLink(s.taskId || s.color ? { title: s.title, taskId: s.taskId ?? null, color: s.color ?? null } : null)
      if (s.category) setCategoryValue(s.category)
      else if (infer && !chosen.current) setCategoryValue(inferLabel(s.title))
    },
    reset: () => {
      chosen.current = false
      setLink(null)
      setPickedColor(undefined)
      setTitleValue('')
      setCategoryValue('')
    },
  }
}
