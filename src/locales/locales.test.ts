import { describe, expect, it } from 'vitest'
import ts from 'typescript'
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

/** すべての文（値）と鍵 */
function flatEntries(obj: object, prefix = ''): [string, string][] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? flatEntries(v as object, `${prefix}${k}.`)
      : typeof v === 'string'
        ? [[`${prefix}${k}`, v] as [string, string]]
        : [],
  )
}

/** 文言に書くべき文字（全角の記号・かな・漢字）。部品の中で組み立てると英語の画面に出る */
const JA_TEXT = /[（）、。「」\u3040-\u30ff\u4e00-\u9fff]/
/** 例外: 言語の選択肢の「日本語」（どの言語の画面でもその言語の文字で出す） */
const JA_TEXT_ALLOWED = new Set(['日本語'])

/** 部品（components / contexts / hooks）のソースの文字列・JSX の文字に書かれた日本語（コメントは見ない） */
function jaTextInComponents(): string[] {
  const found: string[] = []
  for (const [file, text] of Object.entries(sources)) {
    if (!/^\.\.\/(components|contexts|hooks)\//.test(file)) continue
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (node: ts.Node) => {
      if ((ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node)) && JA_TEXT.test(node.text)) {
        if (!JA_TEXT_ALLOWED.has(node.text.trim())) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
          found.push(`${file.replace(/^\.\.\//, '')}:${line} ${JSON.stringify(node.text.trim())}`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return found
}

describe('locales', () => {
  it('ja は RULES の「言葉」に合う（「〜ましょう」と促さない・「無い」は「ない」・ボタンは「追加」「編集」）', () => {
    const entries = flatEntries(ja)
    expect(entries.filter(([, v]) => v.includes('ましょう'))).toEqual([])
    expect(entries.filter(([, v]) => v.includes('無い'))).toEqual([])
    expect(entries.filter(([k, v]) => /\.(add|edit)\w*$/.test(k) && /(足す|直す)$/.test(v))).toEqual([])
  })

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

  it('部品のソースの文字列に日本語・全角の記号を書かない（文言の鍵に置く。括弧つきは common.withNote、区切りは common.listSeparator）', () => {
    expect(jaTextInComponents()).toEqual([])
  })
})
