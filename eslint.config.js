import js from '@eslint/js'
import globals from 'globals'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * 画面のコード（components・hooks）の「今」。`new Date()` は端末のタイムゾーンの今なので、
 * アプリのタイムゾーンの壁時計（`zonedNow()`・`appTodayKey()`・`useNow()`・`useAppTodayKey()`）を使う。
 * 引数なしの `new Date()` は瞬間として使うとき（`.toISOString()`・`.getTime()` に続くとき）だけ許す。
 * `Date.now()` は瞬間（経過時間・保存の時刻）なのでタイムゾーンに関係なく、止めない
 */
const noDeviceNow = {
  selector:
    "NewExpression[callee.name='Date'][arguments.length=0]:not(MemberExpression[property.name=/^(toISOString|getTime)$/] > NewExpression.object)",
  message:
    '画面の「今」は zonedNow() / appTodayKey()（描画では useNow() / useAppTodayKey()）を使う（src/lib/timeZone.ts）。瞬間として使うなら new Date().toISOString() / .getTime()',
}

/**
 * 入力欄の確定の Enter・取り消しの Esc。素の `e.key === 'Enter'` は日本語の変換を確定する Enter でも動くので、
 * `isSubmitEnter` / `isCancelEscape`（変換中は `isImeKeyEvent`）を使う（src/lib/keyboard.ts）
 */
const noRawEnterEscape = {
  selector:
    "BinaryExpression[operator=/^[!=]==?$/]:matches([left.property.name='key'][right.value=/^(Enter|Escape)$/], [right.property.name='key'][left.value=/^(Enter|Escape)$/])",
  message:
    'Enter / Esc は isSubmitEnter(e) / isCancelEscape(e)（src/lib/keyboard.ts）で見る（日本語の変換の Enter / Esc を除くため）。入力欄でないボタンなどは理由を書いて eslint-disable-next-line',
}

/** date-fns の「今日」「過去」は端末のタイムゾーンで見るので、アプリの今日（isAppToday・appTodayKey など）を使う */
const deviceTodayImports = {
  name: 'date-fns',
  importNames: [
    'isToday',
    'isTomorrow',
    'isYesterday',
    'isPast',
    'isFuture',
    'startOfToday',
    'startOfTomorrow',
    'startOfYesterday',
    'endOfToday',
    'endOfTomorrow',
    'endOfYesterday',
    'isThisWeek',
    'isThisMonth',
    'isThisYear',
    'isThisHour',
    'isThisMinute',
    'isThisQuarter',
    'isThisISOWeek',
    'isThisSecond',
  ],
  message: '端末のタイムゾーンの今日になる。isAppToday・appTodayKey（src/lib/timeZone.ts）などアプリの今日を使う',
}

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
      parserOptions: {
        // 型を見るルール（no-floating-promises など）のため。tsconfig.*.json の各プロジェクトを使う
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // autoFocus は押して開いた欄・ポップオーバー・メニューの入力だけに使う（開いたものへフォーカスを移すのは ARIA のダイアログ・メニューと同じ）
      'jsx-a11y/no-autofocus': 'off',
      // スイッチ（SettingsPrimitives の Switch）は中身が button[role=switch] なので、包んだ label で押せる
      'jsx-a11y/label-has-associated-control': ['error', { controlComponents: ['Switch'] }],
      // Promise を捨てない（呼びっぱなしは void を付ける）・onClick などに async 関数を直接渡さない（失敗が unhandledrejection に流れるだけになる）
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      // 確認・知らせは画面の部品（ConfirmDialog・トースト）で出す
      'no-alert': 'error',
      'no-restricted-imports': ['error', { paths: [deviceTodayImports] }],
    },
  },
  {
    // 画面のコード: 端末の「今」・素の Enter / Esc を止める
    files: ['src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', noDeviceNow, noRawEnterEscape],
    },
  },
  {
    // テストは時刻を固定するために date-fns の今日も使う
    files: ['**/*.test.{ts,tsx}', 'e2e/**'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // Supabase の Edge Functions は Deno で、どの tsconfig にも入らないので型を見るルールは掛けない
    files: ['supabase/**/*.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
])
