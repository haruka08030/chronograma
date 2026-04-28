import { useCallback, useMemo, useState } from 'react'

interface WithId {
  id: string
}

export function useTaskDetailModal<T extends WithId>(tasks: readonly T[]) {
  const [detailId, setDetailId] = useState<string | null>(null)

  const detailTask = useMemo(() => {
    if (!detailId) return null
    return tasks.find((task) => task.id === detailId) ?? null
  }, [detailId, tasks])

  const openDetail = useCallback((taskId: string) => {
    setDetailId(taskId)
  }, [])

  const closeDetail = useCallback(() => {
    setDetailId(null)
  }, [])

  return { detailTask, openDetail, closeDetail }
}
