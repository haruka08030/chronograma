import { LinkifiedText } from './LinkifiedText'

/**
 * 押したときのカード・シートに出すメモ（To-Do・記録のカード、Google の予定のカード、指で行を押したときのシート）。
 * 3 行まで、中のリンクは押せる。空なら何も出さない。
 */
export function MemoPreview({ text }: { text: string }) {
  const memo = text.trim()
  if (!memo) return null
  return (
    <p className="select-text line-clamp-3 whitespace-pre-line break-words text-xs text-zinc-500 dark:text-zinc-400">
      <LinkifiedText text={memo} />
    </p>
  )
}
