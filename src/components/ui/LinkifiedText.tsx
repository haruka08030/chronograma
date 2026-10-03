import { linkifySegments } from '../../lib/linkify'

/**
 * メモの文章。中の URL は押して開けるリンクにする（タスク詳細・カレンダーのカード）。
 * アクセントは墨色なので、色だけでなく下線でリンクと分かるようにする。
 */
export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {linkifySegments(text).map((seg, i) =>
        seg.type === 'url' ? (
          <a
            key={i}
            href={seg.value}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="break-all text-accent-600 underline decoration-zinc-300 underline-offset-2 hover:decoration-current dark:text-accent-400 dark:decoration-zinc-600"
          >
            {seg.value}
          </a>
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </>
  )
}
