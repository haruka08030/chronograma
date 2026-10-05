import { describe, expect, it } from 'vitest'
import { isPrivateAddress, parseBaseUrl } from './host.ts'

describe('parseBaseUrl', () => {
  it('https のドメイン名だけを origin にする', () => {
    expect(parseBaseUrl('canvas.ucsc.edu/courses/1')).toBe('https://canvas.ucsc.edu')
    expect(parseBaseUrl('https://Canvas.UCSC.edu/')).toBe('https://canvas.ucsc.edu')
  })

  it('http・ポート・IP・内部の名前・ユーザー情報付きは受け付けない', () => {
    for (const bad of [
      'http://canvas.ucsc.edu',
      'https://canvas.ucsc.edu:8443',
      'https://10.0.0.1',
      'https://[::1]',
      'https://localhost',
      'https://db.internal',
      'https://printer.local',
      'https://intranet',
      'https://user:pass@canvas.ucsc.edu',
    ])
      expect(parseBaseUrl(bad), bad).toBeNull()
  })
})

describe('isPrivateAddress', () => {
  it('内部・ループバック・メタデータの IPv4 は内部', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '198.18.0.1',
      '224.0.0.1',
    ])
      expect(isPrivateAddress(ip), ip).toBe(true)
  })

  it('外の IPv4 は内部ではない', () => {
    for (const ip of ['8.8.8.8', '13.32.0.1', '172.32.0.1', '100.128.0.1']) expect(isPrivateAddress(ip), ip).toBe(false)
  })

  it('IPv6 の書き方を変えても内部は内部', () => {
    for (const ip of [
      '::1',
      '::',
      '0:0:0:0:0:0:0:1',
      'fe80::1',
      'fd00::1',
      'FC00::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:169.254.169.254',
      '64:ff9b::a9fe:a9fe',
      '2002:0a00:0001::1',
      '::127.0.0.1',
      'ff02::1',
      'not-an-ip',
    ])
      expect(isPrivateAddress(ip), ip).toBe(true)
  })

  it('外の IPv6 は内部ではない', () => {
    for (const ip of ['2606:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8']) expect(isPrivateAddress(ip), ip).toBe(false)
  })
})
