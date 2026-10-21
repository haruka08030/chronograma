import { describe, expect, it } from 'vitest'
import { configDrifted, sanitizeConfig, type SchemaProperty } from './config.ts'

const schema: SchemaProperty[] = [
  { name: '名前', type: 'title' },
  { name: 'ステータス', type: 'status', options: ['ES を出す', '面接', '内定', '見送り'] },
  { name: '締切', type: 'date' },
]
const saved = {
  statusProperty: 'ステータス',
  dateProperty: '締切',
  actionStatuses: ['ES を出す', '面接'],
  nextStatus: { 'ES を出す': '面接', 面接: '内定' },
}

describe('sanitizeConfig', () => {
  it('今のスキーマにあるものだけ残す', () => {
    expect(sanitizeConfig({ ...saved, actionStatuses: ['ES を出す', 'ない'] }, schema)).toEqual({
      statusProperty: 'ステータス',
      dateProperty: '締切',
      actionStatuses: ['ES を出す'],
      nextStatus: { 'ES を出す': '面接' },
    })
  })
})

describe('configDrifted', () => {
  it('スキーマと合っていれば false', () => {
    expect(configDrifted(saved, schema)).toBe(false)
    expect(configDrifted({ statusProperty: null, dateProperty: null, actionStatuses: [], nextStatus: {} }, schema)).toBe(false)
  })

  it('要アクションのステータスの名前を変えた・消したら true', () => {
    const renamed = [{ name: 'ステータス', type: 'status', options: ['ES 提出', '面接', '内定', '見送り'] }, schema[2]]
    expect(configDrifted(saved, renamed)).toBe(true)
  })

  it('進め先のステータスが無くなったら true', () => {
    const noOffer = [{ name: 'ステータス', type: 'status', options: ['ES を出す', '面接', '見送り'] }, schema[2]]
    expect(configDrifted(saved, noOffer)).toBe(true)
  })

  it('ステータスの列・日付の列が無くなったら true', () => {
    expect(configDrifted(saved, [schema[0], schema[2]])).toBe(true)
    expect(configDrifted(saved, [schema[0], schema[1]])).toBe(true)
  })
})
