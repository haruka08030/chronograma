/**
 * ページを読み込み直す。テストではこのモジュールを差し替える
 * （テストの jsdom は vm の中で動くので、`window.location` を書き換えられない）
 */
export function reloadPage(): void {
  window.location.reload()
}
