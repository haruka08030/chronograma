import { describe, expect, it } from 'vitest'
import { isKnownPushEndpoint } from './pushEndpoint'

describe('isKnownPushEndpoint', () => {
  it('accepts the browsers’ push services', () => {
    for (const url of [
      'https://fcm.googleapis.com/fcm/send/abc:def',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
      'https://web.push.apple.com/QGx1',
      'https://wns2-par02p.notify.windows.com/w/?token=x',
    ]) {
      expect(isKnownPushEndpoint(url)).toBe(true)
    }
  })

  it('rejects anything else', () => {
    for (const url of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evil.example/fcm.googleapis.com/',
      'https://notify.windows.com.evil.example/',
      'https://169.254.169.254/latest/meta-data/',
      'https://localhost/',
      'https://fcm.googleapis.com@evil.example/',
    ]) {
      expect(isKnownPushEndpoint(url)).toBe(false)
    }
  })
})
