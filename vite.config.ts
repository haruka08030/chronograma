import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ライブラリごとに別ファイルにする。アプリのコードだけ変えたデプロイでは、これらはキャッシュがそのまま効く
const vendor = (name: string, pkgs: string) => ({
  name,
  test: new RegExp(`node_modules[\\\\/](${pkgs})[\\\\/]`),
  priority: 20,
})

// 端末のエラーの報告（`src/lib/errorReport.ts`）に付ける版。package.json の版と、Vercel ならコミットの先頭 7 文字
const appVersion = [process.env.npm_package_version ?? '0', process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)].filter(Boolean).join('+')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            vendor('react', 'react|react-dom|scheduler'),
            vendor('i18n', 'i18next|react-i18next|i18next-browser-languagedetector'),
            vendor('supabase', '@supabase'),
            vendor('dnd-kit', '@dnd-kit'),
            vendor('date-fns', 'date-fns'),
          ],
        },
      },
    },
  },
})
