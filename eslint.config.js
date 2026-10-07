import js from '@eslint/js'
import globals from 'globals'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.claude', '.shots', 'test-results', 'playwright-report']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // autoFocus は押して開いた欄・ポップオーバー・メニューの入力だけに使う（開いたものへフォーカスを移すのは ARIA のダイアログ・メニューと同じ）
      'jsx-a11y/no-autofocus': 'off',
      // スイッチ（SettingsPrimitives の Switch）は中身が button[role=switch] なので、包んだ label で押せる
      'jsx-a11y/label-has-associated-control': ['error', { controlComponents: ['Switch'] }],
    },
  },
])
