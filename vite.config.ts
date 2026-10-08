import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ライブラリごとに別ファイルにする。アプリのコードだけ変えたデプロイでは、これらはキャッシュがそのまま効く
const vendor = (name: string, pkgs: string) => ({
  name,
  test: new RegExp(`node_modules[\\\\/](${pkgs})[\\\\/]`),
  priority: 20,
})

// 端末のエラーの報告（`src/lib/errorReport.ts`）に付ける版。package.json の版と、Vercel ならコミットの先頭 7 文字
const appVersion = [process.env.npm_package_version ?? '0', process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)].filter(Boolean).join('+')

/** ビルドした sw.js にビルドの印を入れる（デプロイのたびに sw.js の中身が変わり、開いているアプリが新しい版に替わる） */
const swBuildStamp = () => ({
  name: 'sw-build-stamp',
  apply: 'build' as const,
  closeBundle() {
    const file = resolve(__dirname, 'dist/sw.js')
    try {
      writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD_VERSION__', `${appVersion}@${Date.now()}`))
    } catch {
      /* sw.js が無いビルド（テストなど）では何もしない */
    }
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), swBuildStamp()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // 言語の文言（と date-fns の日本語）は表示する言語の分だけ後から読む（i18n/config.ts）。名前で中身が分かるように分ける。
            // 使っている共通の部品（初期の名前・date-fns の locale の部品）まで引き込むと起動時に読むことになるので、引き込まない
            {
              name: 'locale-ja',
              test: /src[\\/]locales[\\/]ja\.ts$|node_modules[\\/]date-fns[\\/]locale[\\/]ja[\\/.]/,
              priority: 30,
              includeDependenciesRecursively: false,
            },
            { name: 'locale-en', test: /src[\\/]locales[\\/]en\.ts$/, priority: 30, includeDependenciesRecursively: false },
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
