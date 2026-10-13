import { describe, expect, it } from 'vitest'
import { SHARED_LINE_MAX, sharedQuickAdd, splitUrls } from './shareTarget'

describe('splitUrls', () => {
  it('文中の URL を取り出し、残りの空白をまとめる', () => {
    expect(splitUrls('説明会  https://example.com/a?b=1  申込')).toEqual({ rest: '説明会 申込', urls: ['https://example.com/a?b=1'] })
  })

  it('日本語に続けて書いた URL は日本語を含めない。後ろの句読点・かっこも外す', () => {
    expect(splitUrls('詳細はhttps://example.com/x。')).toEqual({ rest: '詳細は 。', urls: ['https://example.com/x'] })
    expect(splitUrls('募集 (https://example.com/y).')).toEqual({ rest: '募集', urls: ['https://example.com/y'] })
    expect(splitUrls('wiki https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual({
      rest: 'wiki',
      urls: ['https://en.wikipedia.org/wiki/Foo_(bar)'],
    })
  })

  it('URL の跡に残る区切りは外す。同じ URL は 1 つ', () => {
    expect(splitUrls('説明会 - https://a.example/ | https://a.example/')).toEqual({ rest: '説明会', urls: ['https://a.example/'] })
  })

  it('http(s) でないものは URL として扱わない', () => {
    expect(splitUrls('ftp://example.com メモ')).toEqual({ rest: 'ftp://example.com メモ', urls: [] })
  })

  it('改行は残し、空の行は外す', () => {
    expect(splitUrls('1 行目\n\nhttps://a.example\n2 行目')).toEqual({ rest: '1 行目\n2 行目', urls: ['https://a.example'] })
  })
})

describe('sharedQuickAdd', () => {
  it('テキストだけ: そのまま 1 行に入れる', () => {
    expect(sharedQuickAdd({ text: 'レポートを出す' })).toEqual({ text: 'レポートを出す', note: '' })
  })

  it('URL だけ: 欄には URL だけ（足すとメモに分かれる）', () => {
    expect(sharedQuickAdd({ url: 'https://example.com/entry' })).toEqual({ text: 'https://example.com/entry', note: '' })
  })

  it('タイトルと URL: 「タイトル URL」', () => {
    expect(sharedQuickAdd({ title: '本選考エントリー', url: 'https://example.com/e' })).toEqual({
      text: '本選考エントリー https://example.com/e',
      note: '',
    })
  })

  it('URL が text に入って届いても（Android の多くのアプリ）取り出して末尾へ', () => {
    expect(sharedQuickAdd({ title: '説明会のお知らせ', text: 'https://example.com/s', url: '' })).toEqual({
      text: '説明会のお知らせ https://example.com/s',
      note: '',
    })
    expect(sharedQuickAdd({ text: '説明会 https://example.com/s' })).toEqual({ text: '説明会 https://example.com/s', note: '' })
  })

  it('タイトル・テキスト・URL がそろったとき: 短いテキストは題名の後ろ。同じ URL は 1 つ', () => {
    expect(sharedQuickAdd({ title: 'ES 締切', text: '10/10 まで https://example.com/es', url: 'https://example.com/es' })).toEqual({
      text: 'ES 締切 10/10 まで https://example.com/es',
      note: '',
    })
  })

  it('テキストが題名と同じ・題名を含むなら重ねない', () => {
    expect(sharedQuickAdd({ title: '課題', text: '課題' })).toEqual({ text: '課題', note: '' })
    expect(sharedQuickAdd({ title: '課題', text: '課題 第 3 回' })).toEqual({ text: '課題 第 3 回', note: '' })
    expect(sharedQuickAdd({ title: '課題 第 3 回', text: '第 3 回' })).toEqual({ text: '課題 第 3 回', note: '' })
  })

  it('長いテキスト: 題名があれば題名だけ欄に、本文はメモへ', () => {
    const long = 'あ'.repeat(SHARED_LINE_MAX + 20)
    expect(sharedQuickAdd({ title: '記事', text: `${long} https://example.com/n` })).toEqual({
      text: '記事 https://example.com/n',
      note: long,
    })
  })

  it('長い・複数行のテキストだけ: 1 行目の先頭を欄に、全文はメモへ', () => {
    const r = sharedQuickAdd({ text: `買うもの\n牛乳\n卵 https://example.com/list` })
    expect(r).toEqual({ text: '買うもの https://example.com/list', note: '買うもの\n牛乳\n卵' })
    const long = sharedQuickAdd({ text: 'い'.repeat(SHARED_LINE_MAX * 3) })!
    expect(Array.from(long.text)).toHaveLength(SHARED_LINE_MAX)
    expect(long.text.endsWith('…')).toBe(true)
    expect(long.note).toBe('い'.repeat(SHARED_LINE_MAX * 3))
  })

  it('url に http(s) でないものが来たら使わない', () => {
    expect(sharedQuickAdd({ title: 'x', url: 'javascript:alert(1)' })).toEqual({ text: 'x', note: '' })
  })

  it('何も無ければ null', () => {
    expect(sharedQuickAdd({})).toBeNull()
    expect(sharedQuickAdd({ title: ' ', text: '', url: null })).toBeNull()
  })
})
