import { describe, expect, it } from 'vitest'

/**
 * `useMemo` の中で今日・今を読むなら、時計の購読（`useAppTodayKey()` / `useNow()` / `useNowMinutes()`）の値を依存に入れる。
 * 入れないと、開いたまま日をまたいで描き直しても memo が昨日の結果を返す。
 * 関数の呼び出しは react-hooks の依存の決まりに出ないので、ソースを文字のまま読んで止める
 */

const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../test/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** 今日・今を読む呼び出し */
const READS_CLOCK = /\b(appTodayKey|zonedNow|appToday|isAppToday|isAppTomorrow|isAppPast|isNowOnDay)\(|new Date\(\)/
/** 依存に入っていれば日・分の変わり目で作り直す、と読める名前（todayKey・now・nowMinutes など。showsOnboarding・defaultBlockMinutes は当てない） */
const CLOCK_NAME = /^(today|now|clock)|Today|Now|Clock/
const hasClockDep = (deps: string | null) => deps !== null && deps.split(',').some((d) => CLOCK_NAME.test(d.trim()))
const missesClockDep = (b: { body: string; deps: string | null }) => READS_CLOCK.test(b.body) && !hasClockDep(b.deps)

/** `useMemo(` の本文（対応する閉じかっこまで）と、最後の依存の配列 */
function memoBlocks(text: string): { line: number; body: string; deps: string | null }[] {
  const out: { line: number; body: string; deps: string | null }[] = []
  for (const m of text.matchAll(/\buseMemo\(/g)) {
    const from = m.index + m[0].length
    let depth = 1
    let i = from
    while (i < text.length && depth > 0) {
      const c = text[i]
      if (c === '(') depth++
      else if (c === ')') depth--
      i++
    }
    const body = text.slice(from, i - 1)
    const deps = /\[([^[\]]*)\]\s*,?\s*$/.exec(body)
    out.push({ line: text.slice(0, m.index).split('\n').length, body, deps: deps ? deps[1]! : null })
  }
  return out
}

describe('useMemo の中で今日・今を読むなら、時計の値を依存に入れる', () => {
  it('依存に今日・今の無い useMemo が今日・今を読んでいない', () => {
    const offenders: string[] = []
    for (const [file, text] of Object.entries(sources)) {
      for (const b of memoBlocks(text)) {
        if (missesClockDep(b)) offenders.push(`${file.replace(/^\.\.\//, '')}:${b.line}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('見つける形の確かめ', () => {
    const bad = 'const a = useMemo(() => (isAppToday(d) ? f(1) : 2), [d])'
    const looksLikeNow = 'const a = useMemo(() => zonedNow().getHours(), [showsOnboarding, defaultBlockMinutes])'
    const good = 'const a = useMemo(() => (isAppToday(d) ? f(1) : 2), [d, todayKey])'
    expect(memoBlocks(bad).filter(missesClockDep)).toHaveLength(1)
    expect(memoBlocks(looksLikeNow).filter(missesClockDep)).toHaveLength(1)
    expect(memoBlocks(good).filter(missesClockDep)).toHaveLength(0)
  })
})
