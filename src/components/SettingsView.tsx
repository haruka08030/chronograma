import { useTaskStore, LIST_COLOR_PALETTES } from '../store/taskStore'

export function SettingsView() {
  const listColorPaletteId = useTaskStore((s) => s.listColorPaletteId)
  const setListColorPalette = useTaskStore((s) => s.setListColorPalette)

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-1">設定</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">
        リストの色チップと新規リストの候補に使うパレットを選べます。既存リストの色は変わりません。
      </p>

      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-5">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1">リスト色パレット</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
          色相を等間隔に取り、茶寄りしにくいトーンです。お好みで選んでください。
        </p>
        <div className="space-y-3">
          {LIST_COLOR_PALETTES.map((p) => {
            const selected = listColorPaletteId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setListColorPalette(p.id)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors
                  ${selected
                    ? 'border-accent-500 bg-accent-50/80 dark:bg-accent-500/10 ring-1 ring-accent-500/30'
                    : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/80'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{p.label}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{p.description}</div>
                  </div>
                  {selected && (
                    <span className="text-xs font-medium text-accent-600 dark:text-accent-400 flex-shrink-0">選択中</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {p.colors.map((c) => (
                    <span
                      key={c}
                      className="w-6 h-6 rounded-full ring-1 ring-black/10 dark:ring-white/10"
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
