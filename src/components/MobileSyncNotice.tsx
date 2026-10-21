import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSyncProblem } from '../hooks/useSyncProblem'

/** 回線が一瞬切れただけで出たり消えたりしないよう、「未同期」はこれだけ続いたら出す */
const ERROR_GRACE_MS = 30_000

/**
 * スマホの画面のいちばん上に出す、同期の問題の 1 行（#467）。PC はサイドバーの SyncIndicator で出す。
 * スマホでは SyncIndicator が To-Do の引き出しの中にしか無く、問題があっても気づけなかった。
 * 問題があるときだけ出し、説明は乗せなくても読めるよう文で出す
 */
export function MobileSyncNotice() {
  const { t } = useTranslation()
  const problem = useSyncProblem()
  const kind = problem?.kind ?? null
  const [errorLasted, setErrorLasted] = useState(false)
  useEffect(() => {
    if (kind !== 'error') return
    const timer = setTimeout(() => setErrorLasted(true), ERROR_GRACE_MS)
    return () => {
      clearTimeout(timer)
      setErrorLasted(false)
    }
  }, [kind])

  if (!problem || (problem.kind === 'error' && !errorLasted)) return null
  return (
    <div
      role="status"
      className="flex shrink-0 items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 md:hidden dark:border-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300"
    >
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
      <span className="min-w-0 flex-1 whitespace-pre-line">{problem.detail}</span>
      {problem.kind === 'outdated' && (
        <button type="button" onClick={() => window.location.reload()} className="shrink-0 font-medium underline">
          {t('sync.outdatedShort')}
        </button>
      )}
    </div>
  )
}
