import { linkifySegments, shortUrlLabel } from '../../lib/linkify'

/**
 * メモの文章。中の URL は押して開けるリンクにする（タスク詳細・カレンダーのカード）。
 * アクセントは墨色なので、色だけでなく下線でリンクと分かるようにする。
 * 長い URL は短くして出し（元の URL はホバーで）、上下に余白を足して押せる範囲を広げる（行の高さは変えない）。
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
            title={seg.value}
            onClick={(e) => e.stopPropagation()}
            className="-mx-0.5 break-words rounded px-0.5 py-1 text-accent-600 underline decoration-zinc-300 underline-offset-2 hover:decoration-current dark:text-accent-400 dark:decoration-zinc-600"
          >
            {shortUrlLabel(seg.value)}
          </a>
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </>
  )
}
