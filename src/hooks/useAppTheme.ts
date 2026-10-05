import { useEffect } from 'react'
import { useTaskStore } from '../store/taskStore'

/** 画面上端の帯の色（`index.html` の theme-color と同じ。ダークは本文の背景 zinc-900） */
const THEME_COLOR = { light: '#ffffff', dark: '#18181b' } as const

/** アプリのテーマ（ライト・ダーク・端末に合わせる）を `<html>` の dark と画面上端の帯の色に反映する */
export function useAppTheme() {
  const theme = useTaskStore((s) => s.theme)
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media?.matches === true)
      document.documentElement.classList.toggle('dark', dark)
      // 画面上端の帯（ステータスバー・ブラウザの帯）も端末ではなくアプリのテーマに合わせ、背景と同じ色にする
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
        meta.content = dark ? THEME_COLOR.dark : THEME_COLOR.light
      }
    }
    apply()
    if (theme !== 'system' || !media) return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}
