import { useExitGhost } from '../../hooks/useExitGhost'

/**
 * 下から出るシートの後ろの暗い幕。見せるだけで、押して閉じるのはシートの `useDismiss`（外を押すと閉じるだけで、下には届けない）。
 * 閉じるときは薄れて消える
 */
export function SheetBackdrop({ layer = 'below-card' }: { layer?: 'below-card' | 'below-menu' }) {
  const exitRef = useExitGhost()
  return (
    <div
      ref={exitRef}
      className={`fixed inset-0 ${layer === 'below-menu' ? 'z-[69]' : 'z-[59]'} animate-fade-in bg-black/30`}
      aria-hidden
    />
  )
}
