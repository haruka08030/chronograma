import { LinkifiedText } from './LinkifiedText'

/**
 * 押したときのカード・シートに出すメモ（To-Do・記録のカード、Google の予定のカード、指で行を押したときのシート）。
 * 行数で切らずに全部出す（長いときはカード・シートの中でスクロールして読む）。中のリンクは押せる。空なら何も出さない。
 */
export function MemoPreview({ text, className = '' }: { text: string; className?: string }) {
  const memo = text.trim()
  if (!memo) return null
  return (
    <p className={`select-text whitespace-pre-line break-words text-xs text-zinc-500 dark:text-zinc-400 ${className}`}>
      <LinkifiedText text={memo} />
    </p>
  )
}
