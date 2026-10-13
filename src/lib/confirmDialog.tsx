import { createRoot } from 'react-dom/client'
import { ConfirmDialog, type ConfirmOptions } from '../components/ui/ConfirmDialog'

/**
 * 確認のダイアログを出して、実行なら true を返す（`window.confirm` の代わり）。
 * アプリの外（クラッシュ画面など）からも呼べるよう、呼ぶたびに自分で body に置いて、答えたら片付ける。
 *   if (!(await askConfirm({ message: t('taskBin.emptyConfirm'), confirmLabel: t('taskBin.emptyTrash'), danger: true }))) return
 */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const done = (ok: boolean) => {
      root.unmount()
      host.remove()
      resolve(ok)
    }
    root.render(<ConfirmDialog options={options} onResult={done} />)
  })
}

/**
 * 2 つの選び方と取消のダイアログ。実行のボタンなら 'confirm'、`secondaryLabel` のボタンなら 'secondary'、取消・Esc・背景なら null
 */
export function askChoice(options: ConfirmOptions & { secondaryLabel: string }): Promise<'confirm' | 'secondary' | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const done = (result: 'confirm' | 'secondary' | null) => {
      root.unmount()
      host.remove()
      resolve(result)
    }
    root.render(<ConfirmDialog options={options} onResult={(ok) => done(ok ? 'confirm' : null)} onSecondary={() => done('secondary')} />)
  })
}
