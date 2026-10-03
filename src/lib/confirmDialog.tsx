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
