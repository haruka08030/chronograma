import { render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { blockPersisting, unblockPersistingForTests } from '../lib/persistStorage'
import { useTaskStore } from '../store/taskStore'
import { useShowsOnboarding } from '../hooks/useShowsOnboarding'
import { StorageFullBanner } from './StorageFullBanner'

afterEach(() => unblockPersistingForTests())

describe('保存データを読めなかったとき（#709）', () => {
  it('帯に「保存されない」ことを出し、書き出しと再読み込みの両方を置く', () => {
    blockPersisting('unreadable')
    render(<StorageFullBanner />)
    expect(screen.getByRole('alert')).toHaveTextContent('won’t be saved')
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('はじめの案内を出さない（データが空に見えても初めてではない）', () => {
    useTaskStore.setState({ onboardingDone: false })
    const { result, rerender } = renderHook(() => useShowsOnboarding(true))
    expect(result.current).toBe(true)
    blockPersisting('unreadable')
    rerender()
    expect(result.current).toBe(false)
  })
})
