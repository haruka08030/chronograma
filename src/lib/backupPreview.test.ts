import { describe, expect, it } from 'vitest'
import { previewBackupJson } from './backupFormat'

/**
 * 取り込みは現在のデータを全て置き換える。確認ダイアログに出す件数が
 * 間違っていると判断を誤らせるので、下見だけを固めておく。
 */

const task = (id: string, listId: string) => ({
  id,
  title: id,
  description: '',
  completed: false,
  completedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  order: 0,
  listId,
  sectionId: null,
  parentId: null,
  dueDate: null,
  startTime: null,
  endTime: null,
  priority: 'none',
  tags: [],
  recurrence: null,
})

const list = (id: string) => ({ id, name: id, color: '#888888', order: 0 })

const payload = (tasks: unknown[], lists: unknown[]) =>
  JSON.stringify({ schemaVersion: 1, tasks, lists, habits: [], listSections: [] })

describe('previewBackupJson', () => {
  it('タスクとリストの件数を返す', () => {
    const json = payload([task('a', 'l1'), task('b', 'l1')], [list('l1')])
    expect(previewBackupJson(json)).toEqual({ tasks: 2, lists: 1 })
  })

  it('空のバックアップは 0 件（null ではない）', () => {
    expect(previewBackupJson(payload([], [list('l1')]))).toEqual({ tasks: 0, lists: 1 })
  })

  it('壊れた JSON は null', () => {
    expect(previewBackupJson('{ not json')).toBeNull()
  })

  it('tasks / lists が無いものは null', () => {
    expect(previewBackupJson(JSON.stringify({ schemaVersion: 1 }))).toBeNull()
  })

  it('存在しないリストを参照するタスクがあれば null（取り込ませない）', () => {
    expect(previewBackupJson(payload([task('a', 'missing')], [list('l1')]))).toBeNull()
  })

  it('ID が重複していれば null', () => {
    expect(previewBackupJson(payload([task('a', 'l1'), task('a', 'l1')], [list('l1')]))).toBeNull()
  })
})
