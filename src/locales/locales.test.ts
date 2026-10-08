import { describe, expect, it } from 'vitest'
import ja from './ja'
import en from './en'

// i18next の複数形の接尾辞。言語ごとに要る形が違う（ja は無し、en は _one）ので、ならしてから比べる
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

function flatKeys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? flatKeys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`]))
}

const normalized = (keys: string[]) => new Set(keys.map((k) => k.replace(PLURAL_SUFFIX, '')))

const jaKeys = normalized(flatKeys(ja))
const enKeys = normalized(flatKeys(en))

/** 枝も含めたすべての道筋（returnObjects で配列・まとまりごと読む鍵がある） */
function allPaths(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? [`${prefix}${k}`, ...allPaths(v as object, `${prefix}${k}.`)] : [`${prefix}${k}`],
  )
}
const jaPaths = normalized(allPaths(ja))
const enPaths = normalized(allPaths(en))

// テスト以外の src のソース（locales 自身は除く）を文字のまま読む
const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../locales/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** ソースに文字のまま書かれた t('a.b') の鍵（組み立てる鍵は拾えないので対象外） */
function literalKeysInSource(): Map<string, string> {
  const used = new Map<string, string>()
  for (const [file, text] of Object.entries(sources)) {
    for (const m of text.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)['"]/g)) {
      used.set(m[1], file.replace(/^\.\.\//, ''))
    }
  }
  return used
}

describe('locales', () => {
  it('ja と en の鍵がそろっている（複数形の接尾辞はならす）', () => {
    expect([...jaKeys].filter((k) => !enKeys.has(k))).toEqual([])
    expect([...enKeys].filter((k) => !jaKeys.has(k))).toEqual([])
  })

  it('ソースで使っている鍵は ja と en の両方にある', () => {
    const used = literalKeysInSource()
    expect(used.size).toBeGreaterThan(100)
    const missing = [...used].filter(([k]) => !jaPaths.has(k) || !enPaths.has(k)).map(([k, f]) => `${k} (${f})`)
    expect(missing).toEqual([])
  })
})
