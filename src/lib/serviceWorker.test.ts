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

  it('夜の締め: 開いているアプリへ wrap-up を送って前に出す', async () => {
    const sw = loadServiceWorker({ windows: ['https://app.test/?view=all'] })
    await sw.click({ url: '/?view=planner&wrap-up=1' })
    expect(sw.windows[0].messages).toEqual([{ type: 'wrap-up' }])
    expect(sw.windows[0].focused).toBe(true)
  })

  it('夜の締め: アプリが閉じていれば ?wrap-up=1 の URL を開く', async () => {
    const sw = loadServiceWorker()
    await sw.click({ url: '/?view=planner&wrap-up=1' })
    expect(sw.opened).toEqual(['https://app.test/?view=planner&wrap-up=1'])
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

describe('sw.js 止め忘れの「止める」', () => {
  const data = { url: '/?view=planner', timerStartedAt: '2026-10-08T01:00:00.000Z' }

  it('push の「止める」ボタンとタイマーの開始時刻を通知に載せる', async () => {
    const sw = loadServiceWorker()
    await sw.push({
      title: 'タイマーが動いたままです',
      tag: 'chronograma-timer',
      ...data,
      actions: [{ action: 'stop-timer', title: '止める' }],
    })
    expect(sw.shown[0].options.actions).toEqual([{ action: 'stop-timer', title: '止める' }])
    expect(sw.shown[0].options.data).toMatchObject(data)
  })

  it('アプリが閉じていれば、1 回きりの印を置いて ?stop-timer= の URL を開く', async () => {
    const sw = loadServiceWorker()
    await sw.click(data, 'stop-timer')
    const url = new URL(sw.opened[0])
    expect(url.searchParams.get('stop-timer')).toBe('2026-10-08T01:00:00.000Z')
    expect(url.searchParams.get('view')).toBe('planner')
    expect(await sw.hasLaunchMark(url.searchParams.get('launch')!)).toBe(true)
  })

  it('開いているアプリへは stop-timer を送る', async () => {
    const sw = loadServiceWorker({ windows: ['https://app.test/'] })
    await sw.click(data, 'stop-timer')
    expect(sw.windows[0].messages).toEqual([{ type: 'stop-timer', startedAt: '2026-10-08T01:00:00.000Z' }])
  })

  it('本文を押したときは止めずに今日の計画（タイマーが見える）', async () => {
    const sw = loadServiceWorker({ windows: ['https://app.test/'] })
    await sw.click(data)
    expect(sw.windows[0].messages).toEqual([{ type: 'open-view', view: 'planner' }])
  })
})
