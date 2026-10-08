import { describe, expect, it } from 'vitest'
import { loadServiceWorker } from '../test/swHarness'

describe('sw.js notificationclick', () => {
  it('開始前・締切 1 件の通知: アプリが閉じていれば ?task= の URL を開く', async () => {
    const sw = loadServiceWorker()
    const { closed } = await sw.click({ url: '/?view=planner&task=t1&date=2026-10-09' })
    expect(closed).toBe(true)
    expect(sw.opened).toEqual(['https://app.test/?view=planner&task=t1&date=2026-10-09'])
  })

  it('開始前・締切 1 件の通知: 開いているアプリへ open-task を送って前に出す', async () => {
    const sw = loadServiceWorker({ windows: ['https://app.test/?view=all'] })
    await sw.click({ url: '/?view=planner&task=t1&date=2026-10-09' })
    expect(sw.windows[0].messages).toEqual([{ type: 'open-task', taskId: 't1', date: '2026-10-09' }])
    expect(sw.windows[0].focused).toBe(true)
    expect(sw.opened).toEqual([])
  })

  it('まとめた締切・朝のまとめは今までどおり open-view', async () => {
    const sw = loadServiceWorker({ windows: ['https://app.test/'] })
    await sw.click({ url: '/?view=planner' })
    expect(sw.windows[0].messages).toEqual([{ type: 'open-view', view: 'planner' }])
  })

  it('記録の確認は record（?task= より優先）', async () => {
    const sw = loadServiceWorker({ windows: ['https://app.test/'] })
    await sw.click({ url: '/?record=t2', taskId: 't2' })
    expect(sw.windows[0].messages).toEqual([{ type: 'record', taskId: 't2', asPlanned: false }])
  })

  it('別サイトの URL は開かず、今日の計画にする', async () => {
    const sw = loadServiceWorker()
    await sw.click({ url: 'https://evil.test/?task=t1' })
    expect(sw.opened).toEqual(['https://app.test/?view=planner'])
  })

  it('push の url をそのまま通知の data に入れる', async () => {
    const sw = loadServiceWorker()
    await sw.push({ title: '締切: ES', tag: 'chronograma-due-t1', url: '/?view=planner&task=t1&date=2026-10-09' })
    expect(sw.shown[0].options.data).toMatchObject({ url: '/?view=planner&task=t1&date=2026-10-09' })
    expect(sw.shown[0].options.tag).toBe('chronograma-due-t1')
  })
})
