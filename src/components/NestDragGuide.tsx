/** 右ドラッグでサブ化プレビュー時、親候補行に表示する濃いグレーのネスト・ガイド（layout shift なし） */
export function NestDragGuide() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 rounded-lg bg-accent-500/[0.06] ring-1 ring-inset ring-zinc-400/35 dark:ring-zinc-500/40"
        aria-hidden
      />
      {/* 縦線: 行下端から下のギャップへ伸ばす */}
      <div
        className="pointer-events-none absolute left-[13px] top-full z-10 h-2 w-0.5 -translate-x-1/2 bg-zinc-400 dark:bg-zinc-500"
        aria-hidden
      />
      {/* L字の横線: 子インデント位置へ */}
      <div
        className="pointer-events-none absolute left-[13px] top-[calc(100%+0.5rem)] z-10 h-0.5 w-3 bg-zinc-400 dark:bg-zinc-500"
        aria-hidden
      />
    </>
  )
}
