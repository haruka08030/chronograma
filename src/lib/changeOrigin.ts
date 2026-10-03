/**
 * いまのストアの変更が「この端末でのユーザーの操作」ではないか（同期で届いた・連携の取り込み）。
 * 連携の書き戻し（Canvas の完了・Notion のステータス）は、ユーザーの操作のときだけにする。
 * 他の端末で付けた完了が同期で届いたのを、こちらの操作と見て書き戻すと、タブ・端末の数だけ同じことが起きる
 */
let depth = 0

/** fn の間のストアの変更を「外から来た変更」とする */
export function asIncomingChange(fn: () => void) {
  depth++
  try {
    fn()
  } finally {
    depth--
  }
}

export const isIncomingChange = () => depth > 0
