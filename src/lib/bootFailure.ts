/**
 * アプリ本体（`boot`）を読み込めなかったときの画面（真っ白のまま止まらないように）。
 * この時点では React も i18n の文言も無いので、素の DOM で描き、文言は日英をここに持つ
 */
import { toAppLanguage, type AppLanguage } from '../locales/builtinNames'
import { reloadPage } from './reloadPage'

const TEXT: Record<AppLanguage, { title: string; help: string; reload: string }> = {
  ja: { title: '起動できませんでした', help: '回線を確かめて、再読み込みしてください。データは消えていません。', reload: '再読み込み' },
  en: { title: "Couldn't start", help: 'Check your connection and reload. Your data is safe.', reload: 'Reload' },
}

/** 表示する言語（設定の言語。無ければブラウザの言語。i18n の決め方と同じ） */
export function bootLanguage(): AppLanguage {
  let saved: string | null = null
  try {
    saved = localStorage.getItem('chronograma-lang')
  } catch {
    /* 下へ */
  }
  return toAppLanguage(saved) ?? toAppLanguage(typeof navigator !== 'undefined' ? navigator.language : null) ?? 'en'
}

/** 「起動できませんでした」と再読み込みのボタンを `root` に描く */
export function renderBootFailure(root: HTMLElement, language: AppLanguage = bootLanguage()): void {
  const text = TEXT[language]
  document.documentElement.lang = language
  const box = document.createElement('div')
  box.setAttribute('role', 'alert')
  // ライト・ダークは端末に合わせる（Canvas / CanvasText）
  box.style.cssText =
    'color-scheme:light dark;background:Canvas;color:CanvasText;min-height:100dvh;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:12px;padding:0 16px;text-align:center;font-family:Inter,system-ui,sans-serif'
  const title = document.createElement('h1')
  title.textContent = text.title
  title.style.cssText = 'margin:0;font-size:16px;font-weight:600'
  const help = document.createElement('p')
  help.textContent = text.help
  help.style.cssText = 'margin:0;max-width:24rem;font-size:14px;opacity:.7'
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = text.reload
  // アプリの主ボタンと同じ墨色の塗り
  button.style.cssText =
    'margin-top:4px;padding:8px 16px;border-radius:6px;border:0;background:CanvasText;color:Canvas;font:inherit;font-size:14px;cursor:pointer'
  button.addEventListener('click', reloadPage)
  box.append(title, help, button)
  root.replaceChildren(box)
}
