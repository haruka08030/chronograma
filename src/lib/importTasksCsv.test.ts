import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseCsvRows, parseTasksCsv } from './importTasksCsv'
import { setAppTimeZoneSetting } from './timeZone'
// TickTick（設定 › バックアップ）と Todoist（プロジェクトを CSV で書き出す）の書き出しと同じ形の見本
import tickTickBackup from './fixtures/ticktick-backup.csv?raw'
import todoistProject from './fixtures/todoist-project.csv?raw'

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
        dueTime: null,
        listName: '仕事',
        completed: true,
        completedAt: null,
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

describe('ほかのアプリの書き出し', () => {
  beforeEach(() => setAppTimeZoneSetting('Asia/Tokyo'))
  afterEach(() => setAppTimeZoneSetting(null))

  it('TickTick のバックアップ: 先頭の説明行を飛ばして見出しを探し、題名・メモ・締切（時刻つき）・優先度・完了・タグ・リストを読む', () => {
    const { rows, skipped, errors } = parseTasksCsv(tickTickBackup)
    expect(errors).toEqual([])
    expect(skipped).toBe(0)
    expect(rows.map((r) => r.title)).toEqual(['発表スライドを作る', '参考文献を読む', '牛乳を買う', 'A 社の ES を出す', '持ち物'])
    expect(rows[0]).toEqual({
      title: '発表スライドを作る',
      // UTC の 08:30 → アプリのタイムゾーン（東京）の 17:30
      dueDate: '2026-10-20',
      dueTime: '17:30',
      listName: 'ゼミ',
      completed: false,
      completedAt: null,
      priority: 'high',
      tags: ['研究', '締切'],
      description: '先生に見せる前に\n図を 3 枚入れる',
    })
    // 終日は行のタイムゾーンの日付（UTC では前の日の 15:00）
    expect(rows[1]).toMatchObject({ dueDate: '2026-10-22', dueTime: null, priority: 'medium' })
    // Status 2（完了してアーカイブ）も完了。完了した時刻はそのまま
    expect(rows[2]).toMatchObject({ completed: true, completedAt: '2026-10-03T10:39:31.000Z', priority: 'low', listName: 'Inbox' })
    // 時差の無い日時（空白区切り）は UTC
    expect(rows[3]).toMatchObject({
      dueDate: '2026-10-25',
      dueTime: '23:59',
      completed: true,
      completedAt: '2026-10-05T01:45:30.000Z',
      priority: 'none',
      tags: ['就活'],
    })
    expect(rows[4]).toMatchObject({ dueDate: null, description: '▫財布\n▪鍵' })
  })

  it('Todoist のプロジェクト: task の行だけを読み、CONTENT を題名・@ラベルをタグ・ファイル名をリストにする', () => {
    const { rows, skipped, errors } = parseTasksCsv(todoistProject, { fileName: 'ゼミ [2203306141].csv' })
    expect(errors).toEqual([])
    // section・note・区切りの空行は To-Do にも「飛ばした行」にもしない
    expect(skipped).toBe(0)
    expect(rows.map((r) => r.title)).toEqual(['レポートを出す', '洗濯', '面接の準備', '企業研究'])
    expect(rows[0]).toEqual({
      title: 'レポートを出す',
      dueDate: '2026-10-20',
      dueTime: '17:00',
      listName: 'ゼミ',
      completed: false,
      completedAt: null,
      priority: 'high',
      tags: ['大学', '提出'],
      description: '第 3 章まで, 図つき',
    })
    // p4 は優先度なし。「every day」のような言葉の日付は入れない
    expect(rows[1]).toMatchObject({ priority: 'none', dueDate: null, dueTime: null })
    expect(rows[2]).toMatchObject({ priority: 'medium', dueDate: '2026-10-22', dueTime: null })
    // 日付が無ければ締切（DEADLINE）
    expect(rows[3]).toMatchObject({ priority: 'low', dueDate: '2026-10-24' })
  })

  it('Todoist でファイル名が分からなければリストは空', () => {
    expect(parseTasksCsv(todoistProject).rows[0]!.listName).toBeNull()
    expect(parseTasksCsv(todoistProject, { fileName: '仕事.csv' }).rows[0]!.listName).toBe('仕事')
  })

  it('見出しの上の行が説明でも、ふつうの CSV の数字の優先度は読まない', () => {
    const { rows } = parseTasksCsv('書き出した日: 2026-10-13\ntitle,due,priority\nA,2026-10-20 9:05,1')
    expect(rows).toEqual([expect.objectContaining({ title: 'A', dueDate: '2026-10-20', dueTime: '09:05', priority: 'none' })])
  })
})
