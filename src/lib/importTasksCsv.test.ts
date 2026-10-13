import { describe, expect, it } from 'vitest'
import { parseCsvRows, parseTasksCsv } from './importTasksCsv'

describe('parseCsvRows', () => {
  it('引用符の中のカンマ・改行・二重引用符をそのまま読む', () => {
    expect(parseCsvRows('a,"b,c","d\ne","f""g"\n')).toEqual([['a', 'b,c', 'd\ne', 'f"g']])
  })

  it('BOM・CRLF・CR の改行を読み、空行は飛ばす。最後に改行が無くても最後の行を落とさない', () => {
    expect(parseCsvRows('﻿a,b\r\nc,d\re,f\n\n\ng,h')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
      ['g', 'h'],
    ])
  })

  it('末尾の空のセルも数える', () => {
    expect(parseCsvRows('a,,\n')).toEqual([['a', '', '']])
  })
})

describe('parseTasksCsv', () => {
  it('日本語の見出しと値を読む', () => {
    const { rows, skipped, errors } = parseTasksCsv(
      'タイトル,期限,リスト,完了,優先度,タグ,メモ\n企画書,2026/1/5,仕事,完了,高,"a; b",下書き\n',
    )
    expect(errors).toEqual([])
    expect(skipped).toBe(0)
    expect(rows).toEqual([
      {
        title: '企画書',
        dueDate: '2026-01-05',
        listName: '仕事',
        completed: true,
        priority: 'high',
        tags: ['a', 'b'],
        description: '下書き',
      },
    ])
  })

  it('見出しの大文字・空白をそろえ、知らない列は読まない', () => {
    const { rows } = parseTasksCsv('Due Date,Title,Whatever\n2026-10-09,  A  ,zzz')
    expect(rows).toEqual([expect.objectContaining({ title: 'A', dueDate: '2026-10-09', listName: null, priority: 'none' })])
  })

  it('見出しが無ければ「題名, 期限, リスト, 完了, タグ」の順で読む（1 行目もタスク）', () => {
    const { rows } = parseTasksCsv('買い物,2026-10-10,家,yes,x\n掃除')
    expect(rows.map((r) => r.title)).toEqual(['買い物', '掃除'])
    expect(rows[0]).toMatchObject({ dueDate: '2026-10-10', listName: '家', completed: true, tags: ['x'] })
    expect(rows[1]).toMatchObject({ dueDate: null, listName: null, completed: false, tags: [] })
  })

  it('題名の無い行は数えて飛ばす。題名の列が無ければ 1 行も読まない', () => {
    expect(parseTasksCsv('title,due\n,2026-10-01\n   ,\nA,').skipped).toBe(2)
    expect(parseTasksCsv('due,list\n2026-10-01,x')).toEqual({ rows: [], skipped: 0, errors: ['missing_title_column'] })
    expect(parseTasksCsv('')).toEqual({ rows: [], skipped: 0, errors: ['empty'] })
  })

  it('読めない日付・知らない優先度は空にする（でたらめな日付を入れない）', () => {
    const { rows } = parseTasksCsv('title,due,priority\nA,そのうち,urgent\nB,2026-13-45,low')
    expect(rows[0]).toMatchObject({ dueDate: null, priority: 'none' })
    expect(rows[1]!.priority).toBe('low')
    expect(rows[1]!.dueDate === null || /^\d{4}-\d{2}-\d{2}$/.test(rows[1]!.dueDate)).toBe(true)
  })
})
