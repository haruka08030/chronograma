import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 対象は純粋なロジック（同期マージ・クイック追加の解釈）。DOM は使わない。
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
