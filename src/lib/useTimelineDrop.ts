import { useState, useCallback, useRef } from 'react'
import { HOUR_HEIGHT, yToTime, timeToMinutes } from './timeGrid'

export const TASK_DND_TYPE = 'application/x-task-id'
const DEFAULT_DURATION_MIN = 60

export interface DropPreview {
  dateKey: string
  top: number
  height: number
  label: string
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

interface UseTimelineDropOptions {
  getRelativeY: (clientY: number, dateKey: string) => number
  getTaskDuration?: (taskId: string) => number | null
  onDrop: (taskId: string, dateKey: string, startTime: string, endTime: string) => void
}

export function useTimelineDrop(options: UseTimelineDropOptions) {
  const { getRelativeY, getTaskDuration, onDrop } = options
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null)
  const enterCountRef = useRef(0)


  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(TASK_DND_TYPE)) return
    enterCountRef.current++
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, dateKey: string) => {
    if (!e.dataTransfer.types.includes(TASK_DND_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const y = getRelativeY(e.clientY, dateKey)
    const startTime = yToTime(y)
    const startMin = timeToMinutes(startTime)
    const duration = DEFAULT_DURATION_MIN
    const endMin = Math.min(startMin + duration, 24 * 60)
    const actualDuration = endMin - startMin
    const height = (actualDuration / 60) * HOUR_HEIGHT
    setDropPreview({ dateKey, top: y, height, label: `${startTime} – ${minutesToTime(endMin)}` })
  }, [getRelativeY])

  const handleDragLeave = useCallback(() => {
    enterCountRef.current--
    if (enterCountRef.current <= 0) {
      enterCountRef.current = 0
      setDropPreview(null)
    }
  }, [])

  const handleDropEvent = useCallback((e: React.DragEvent, dateKey: string) => {
    e.preventDefault()
    enterCountRef.current = 0
    const taskId = e.dataTransfer.getData(TASK_DND_TYPE)
    if (!taskId) { setDropPreview(null); return }
    const y = getRelativeY(e.clientY, dateKey)
    const startTime = yToTime(y)
    const startMin = timeToMinutes(startTime)
    const duration = getTaskDuration?.(taskId) ?? DEFAULT_DURATION_MIN
    const endMin = Math.min(startMin + (duration > 0 ? duration : DEFAULT_DURATION_MIN), 24 * 60)
    onDrop(taskId, dateKey, startTime, minutesToTime(endMin))
    setDropPreview(null)
  }, [getRelativeY, getTaskDuration, onDrop])

  return {
    dropPreview,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDropEvent,
  }
}
