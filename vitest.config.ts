import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          // 純粋なロジック（同期マージ・クイック追加の解釈など）。DOM は使わない
          name: 'unit',
          include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          // 部品のテスト（*.test.tsx）。jsdom で描いて、本物のストアと i18n で操作する
          name: 'components',
          include: ['src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['src/test/setup.ts'],
        },
      },
    ],
  },
})
