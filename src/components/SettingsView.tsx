import { useLayoutEffect } from 'react'
import { useTaskStore, LIST_COLOR_PALETTES } from '../store/taskStore'
import { isSupabaseConfigured } from '../lib/supabase'
import { AccountMenu } from './AccountMenu'
import { ThemeToggle } from './ThemeToggle'

export function SettingsView() {
  const listColorPaletteId = useTaskStore((s) => s.listColorPaletteId)
  const setListColorPalette = useTaskStore((s) => s.setListColorPalette)
  const settingsScrollTarget = useTaskStore((s) => s.settingsScrollTarget)
  const clearSettingsScrollTarget = useTaskStore((s) => s.clearSettingsScrollTarget)

  useLayoutEffect(() => {
    if (!settingsScrollTarget) return
    const id =
      settingsScrollTarget === 'appearance' ? 'settings-appearance' : 'settings-account'
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
    clearSettingsScrollTarget()
  }, [settingsScrollTarget, clearSettingsScrollTarget])

  return (
    <div className="max-w-2xl flex-1 space-y-8 overflow-y-auto px-6 py-8">
      <div>
        <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">設定</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          外観・アカウント・リストの色パレットを変更できます。
        </p>
      </div>

      <section
        id="settings-appearance"
        className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50"
      >
        <h2 className="mb-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">外観</h2>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <svg
              className="h-4 w-4 flex-shrink-0 text-zinc-500 dark:text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
            </svg>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <section
        id="settings-account"
        className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50"
      >
        <h2 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">アカウント</h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          メールのマジックリンクでログインすると、タスクなどを複数端末で同期できます。
        </p>
        {isSupabaseConfigured ? (
          <div className="relative">
            <AccountMenu variant="settings" />
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Supabase が未設定のため、クラウドログインは利用できません。
          </p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h2 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">リスト色パレット</h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          リストの色チップと新規リストの候補に使うパレットを選べます。既存リストの色は変わりません。
        </p>
        <div className="space-y-3">
          {LIST_COLOR_PALETTES.map((p) => {
            const selected = listColorPaletteId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setListColorPalette(p.id)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors
                  ${selected
                    ? 'border-accent-500 bg-accent-50/80 ring-1 ring-accent-500/30 dark:bg-accent-500/10'
                    : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/80'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{p.label}</div>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{p.description}</div>
                  </div>
                  {selected && (
                    <span className="flex-shrink-0 text-xs font-medium text-accent-600 dark:text-accent-400">選択中</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.colors.map((c) => (
                    <span
                      key={c}
                      className="h-6 w-6 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                      style={{ backgroundColor: c }}
                      aria-hidden
                    />
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
