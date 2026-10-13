import { buttonClass } from './buttonClass'
import { GoogleLogo } from './GoogleLogo'

/**
 * 「Google でログイン」のボタン（設定のログインと、ログインの誘いで同じ見た目）。
 * 墨色の塗りに、白い丸に入れた G を付ける。押したあとの動き（Google に移る・失敗を出す）は使う側が持つ
 */
export function GoogleSignInButton({
  onClick,
  disabled,
  size = 'lg',
  className = '',
  children,
}: {
  onClick: () => void
  disabled?: boolean
  size?: 'sm' | 'lg'
  className?: string
  children: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={buttonClass({ variant: 'primary', size }, className)}>
      <span className={`flex items-center justify-center rounded-full bg-white ${size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'}`} aria-hidden>
        <GoogleLogo className={size === 'lg' ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
      </span>
      {children}
    </button>
  )
}
