import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { clearDialogDrafts } from '../lib/dialogDrafts'

// ストアの初期状態（最初に読み込んだ時点）。テストごとにここへ戻す
const initialStoreState = useTaskStore.getInitialState()

beforeAll(async () => {
  // 文言は後から読む（i18n/config.ts）。テストでは両方の言語を先に読んでおく（日本語の文言を直接見るテストがある）
  await i18n.loadLanguages(['ja', 'en'])
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  localStorage.clear()
  useTaskStore.setState(initialStoreState, true)
  // 閉じたダイアログの書きかけはメモリに残るので、前のテストのものを持ち越さない
  clearDialogDrafts()
})

afterEach(() => {
  cleanup()
})

// プロセスはファイルをまたいで使い回す（vmForks）。ファイルで替えた環境変数（TZ など）を次のファイルへ持ち越さない
afterAll(() => {
  vi.unstubAllEnvs()
})
