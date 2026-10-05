import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach } from 'vitest'
import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'

// ストアの初期状態（最初に読み込んだ時点）。テストごとにここへ戻す
const initialStoreState = useTaskStore.getInitialState()

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  localStorage.clear()
  useTaskStore.setState(initialStoreState, true)
})

afterEach(() => {
  cleanup()
})
