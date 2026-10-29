import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTaskStore } from '../store/taskStore'
import { useLabeledSwatches } from './useLabeledSwatches'

describe('useLabeledSwatches', () => {
  it('名前を付けた色は「ラベル名（色名）」、無ければ色名（To-Do リストの色もパレットと同じ）', () => {
    useTaskStore.setState({ timeLogTagPresets: ['課題'], logCategoryColors: { 課題: 'tomato' } })
    const { result } = renderHook(() => useLabeledSwatches())
    expect(result.current).toHaveLength(24)
    expect(result.current.find((s) => s.hex === '#D50000')?.name).toBe('課題 (Tomato)')
    expect(result.current.find((s) => s.hex === '#33B679')?.name).toBe('Sage')
  })
})
