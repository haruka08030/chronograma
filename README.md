# Chronograma

タスク・カレンダー・タイムログ向けの React アプリです。データはブラウザの localStorage に保存されます。オプションで **Supabase** を設定するとログイン（メールのマジックリンク）とリスト／タスクのクラウド同期が有効になります。

## Supabase のセットアップ（マルチデバイス同期）

1. [Supabase](https://supabase.com) でプロジェクトを作成します。
2. **SQL Editor** で `supabase/migrations/001_chronograma_lists_tasks.sql` の内容を実行し、`lists` / `tasks` テーブルと RLS を作成します。続けて未実行なら `002_habits.sql`（習慣）、`003_list_sections.sql`（リスト内セクションと `tasks.section_id`）を同様に実行します。
3. **Authentication → URL Configuration** で **Site URL** に本番のオリジン（開発時は `http://localhost:5173` など）を設定し、**Redirect URLs** にも同じオリジンを追加します（マジックリンクのリダイレクト用）。
4. **Project Settings → API** から **Project URL** と **anon public** キーをコピーします。
5. プロジェクトルートに `.env` を置き、`.env.example` を参考に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定します。開発サーバーを再起動します。

ヘッダーの「ログイン」からメールアドレスを送信し、届いたリンクでサインインすると、約 1.8 秒のデバウンス後に変更がサーバーへ同期されます。

---
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
