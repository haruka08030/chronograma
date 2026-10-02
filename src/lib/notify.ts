import { useTaskStore } from '../store/taskStore'

/**
 * 画面下の短い通知で知らせる（ブロックするダイアログ `alert` は使わない）。
 * 戻せる操作の結果は、`pushUndo` にラベルを渡して「元に戻す」付きの通知にする。
 */
export function notify(text: string) {
  useTaskStore.getState().showMoveBanner(text)
}
