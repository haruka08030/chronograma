import { useTranslation } from 'react-i18next'
import { chipClass } from './chipClass'

/**
 * 書き方・使い方の例のボタン（はじめの案内の追加欄の下、習慣・いつかの空っぽの画面）。説明を読ませず、押せば 1 件できる所まで進める。
 * 押すと `onPick` に例の文字を渡す（欄に入れる・作るカードを開くは呼ぶ側）
 */
export function ExampleChips({
  examples,
  onPick,
  className = '',
}: {
  examples: readonly string[]
  onPick: (example: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {examples.map((example) => (
        <button
          key={example}
          type="button"
          onClick={() => onPick(example)}
          aria-label={t('onboarding.useExample', { text: example })}
          className={chipClass({ variant: 'outline', size: 'md' }, 'pointer-coarse:min-h-9')}
        >
          {example}
        </button>
      ))}
    </div>
  )
}
