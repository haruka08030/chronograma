import { DueIcon } from '../icons'
import { DUE_TONE_CLASS, type DateTone } from './dueTone'

/** 締切の小さな印（→| と「10/16 (金)」、近さの色）。To-Do の行とカレンダーの To-Do のカードで同じ */
export function DueChip({ tone, text, className = '' }: { tone: DateTone; text: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] ${DUE_TONE_CLASS[tone]} ${className}`}>
      <DueIcon className="w-3 h-3" />
      {text}
    </span>
  )
}
