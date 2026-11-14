/**
 * 寝た時刻と起きた時刻の間に置く、睡眠の色の細い線（「睡眠」「〜」の文字の代わり）。
 * 中抜きの帯にすると空のバーや入力欄に見えるので、塗りの線 1 本にする（#624）。
 * `open` は寝ている途中（続きを点線にして、まだ続いていることを見せる）
 */
export function SleepBar({ open = false }: { open?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center" aria-hidden>
      <span className={`h-0.5 bg-sleep ${open ? 'w-4 rounded-l-full' : 'w-7 rounded-full'}`} />
      {open && <span className="w-3 border-t-2 border-dotted border-sleep/60" />}
    </span>
  )
}
