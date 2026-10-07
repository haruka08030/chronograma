import type { TouchEvent as ReactTouchEvent } from 'react'
import { TouchSensor, type Activators, type SensorInstance, type SensorProps } from '@dnd-kit/core'
import { TASK_PREFIX } from '../components/SortableTaskItem'
import { endLift, hasLiftMoved, isTouchLiftTarget, markLiftMoving, rowIdOfTarget, startLift, type Point } from './touchLift'

export type AppTouchSensorOptions = {
  /** つまみ（セクション・リスト・PC 幅のタッチの ⠿）から始めるときの待ち */
  handleDelay: number
  /** 行の長押しで浮かせるまでの待ち（`useLongPress` と同じ長さ） */
  liftDelay: number
  /** 待っている間にこれより動いたらスクロール・横払いとして任せる */
  tolerance: number
}

type TouchLike = { identifier: number; clientX: number; clientY: number }
type TouchListLike = { length: number; [i: number]: TouchLike }

function findTouch(list: TouchListLike | undefined, id: number): Point | null {
  if (!list) return null
  for (let i = 0; i < list.length; i++) {
    const t = list[i]!
    if (t.identifier === id) return { x: t.clientX, y: t.clientY }
  }
  return null
}

const stopClick = (e: Event) => e.stopPropagation()
const preventDefault = (e: Event) => e.preventDefault()

/**
 * 画面全体の DndContext のタッチのセンサー。始めた所で 2 通りに動く。
 * - つまみから: 今までの TouchSensor と同じ（短い待ちで持ち上げる）
 * - 浮かせられる行（`data-touch-lift`）から: 長押しで浮かせて選択に入れる（`startLift`）。押さえている間は別の指のタップで束に足せる。
 *   指を動かせば束ごと運び、動かさずに離したら運ばずに終える（onCancel。選んだ状態が残る）
 * 押さえている指は identifier で追う。別の指が同じ行に触れて離れても、ドラッグは終わらない
 */
export class AppTouchSensor implements SensorInstance {
  static activators: Activators<AppTouchSensorOptions> = [
    {
      eventName: 'onTouchStart',
      handler: ({ nativeEvent: event }: ReactTouchEvent) => event.touches.length <= 1,
    },
  ]

  /** iOS Safari で、後から付けた touchmove の preventDefault を効かせる（TouchSensor と同じ） */
  static setup = TouchSensor.setup

  autoScrollEnabled = true

  private props: SensorProps<AppTouchSensorOptions>
  private lift: boolean
  private primaryId: number
  private origin: Point
  private target: EventTarget
  private constraint: { delay: number; tolerance: number }
  private activated = false
  private moved = false
  private timer: number | null = null

  constructor(props: SensorProps<AppTouchSensorOptions>) {
    this.props = props
    const event = props.event as unknown as { target: EventTarget; changedTouches?: TouchListLike; touches?: TouchListLike }
    const first = event.changedTouches?.[0] ?? event.touches?.[0]
    this.primaryId = first?.identifier ?? 0
    this.origin = first ? { x: first.clientX, y: first.clientY } : { x: 0, y: 0 }
    this.target = event.target
    this.lift = isTouchLiftTarget(event.target)
    const { handleDelay, liftDelay, tolerance } = props.options
    this.constraint = { delay: this.lift ? liftDelay : handleDelay, tolerance }
    this.attach()
  }

  private attach() {
    this.target.addEventListener('touchmove', this.handleMove as EventListener, { passive: false })
    this.target.addEventListener('touchend', this.handleEnd as EventListener)
    this.target.addEventListener('touchcancel', this.handleCancel)
    window.addEventListener('resize', this.handleCancel)
    document.addEventListener('visibilitychange', this.handleCancel)
    window.addEventListener('dragstart', preventDefault)
    // Android の長押しのメニューを出さない
    window.addEventListener('contextmenu', preventDefault)
    this.timer = window.setTimeout(this.handleStart, this.constraint.delay)
    this.props.onPending(this.props.active, this.constraint, this.origin)
  }

  private detach() {
    this.target.removeEventListener('touchmove', this.handleMove as EventListener)
    this.target.removeEventListener('touchend', this.handleEnd as EventListener)
    this.target.removeEventListener('touchcancel', this.handleCancel)
    window.removeEventListener('resize', this.handleCancel)
    document.removeEventListener('visibilitychange', this.handleCancel)
    window.removeEventListener('dragstart', preventDefault)
    window.removeEventListener('contextmenu', preventDefault)
    if (this.timer !== null) window.clearTimeout(this.timer)
    this.timer = null
    // 離した直後の click（行を開く・選択の切り替え）を止めてから外す
    if (this.activated) window.setTimeout(() => document.removeEventListener('click', stopClick, { capture: true }), 50)
    if (this.lift && this.activated) endLift()
  }

  private handleStart = () => {
    this.timer = null
    this.activated = true
    document.addEventListener('click', stopClick, { capture: true })
    this.props.onStart(this.origin)
    if (!this.lift) return
    navigator.vibrate?.(15)
    const rowId = rowIdOfTarget(this.target)
    // サブタスクは束にして運べないので、別の指では足さない
    if (rowId) startLift(rowId, { extraTaps: String(this.props.active).startsWith(TASK_PREFIX) })
  }

  private handleMove = (e: TouchEvent) => {
    const p = findTouch(e.touches, this.primaryId) ?? findTouch(e.changedTouches, this.primaryId)
    if (!p) return
    if (!this.activated) {
      if (Math.hypot(p.x - this.origin.x, p.y - this.origin.y) > this.constraint.tolerance) this.handleCancel()
      return
    }
    if (e.cancelable) e.preventDefault()
    if (this.lift && !this.moved && hasLiftMoved(this.origin, p)) {
      this.moved = true
      markLiftMoving()
    }
    this.props.onMove(p)
  }

  private handleEnd = (e: TouchEvent) => {
    // 別の指が同じ行で離れただけなら続ける
    if (!findTouch(e.changedTouches, this.primaryId)) return
    const activated = this.activated
    this.detach()
    if (!activated) {
      this.props.onAbort(this.props.active)
      this.props.onEnd()
      return
    }
    if (e.cancelable) e.preventDefault()
    // 浮かせて動かさずに離した: 運ばない（選んだ状態だけ残す）
    if (this.lift && !this.moved) this.props.onCancel()
    else this.props.onEnd()
  }

  private handleCancel = () => {
    const activated = this.activated
    this.detach()
    if (!activated) this.props.onAbort(this.props.active)
    this.props.onCancel()
  }
}
