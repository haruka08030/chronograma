import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ライブラリごとに別ファイルにする。アプリのコードだけ変えたデプロイでは、これらはキャッシュがそのまま効く
const vendor = (name: string, pkgs: string) => ({
  name,
  test: new RegExp(`node_modules[\\\\/](${pkgs})[\\\\/]`),
  priority: 20,
})

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
