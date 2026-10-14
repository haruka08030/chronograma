import { useRef, useState } from 'react'
import { useTaskStore } from '../store/taskStore'
import { withInferredCategory } from '../store/storeDefaults'
import type { LogTitleSuggestion } from '../lib/logCategory'

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
  /** 自分でラベルを選んだ（外した）か */
  const chosen = useRef(false)
  return {
    title,
    category,
    setTitle: (v: string) => {
      setTitleValue(v)
      if (infer && !chosen.current) setCategoryValue(inferLabel(v))
    },
    setCategory: (v: string) => {
      chosen.current = true
      setCategoryValue(v)
    },
    pick: (s: LogTitleSuggestion) => {
      setTitleValue(s.title)
      if (s.category) setCategoryValue(s.category)
      else if (infer && !chosen.current) setCategoryValue(inferLabel(s.title))
    },
    reset: () => {
      chosen.current = false
      setTitleValue('')
      setCategoryValue('')
    },
  }
}
