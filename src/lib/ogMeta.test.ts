import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'
import ogPng from '../../public/og.png?inline'
import { absolutizeOgUrls, siteOrigin } from './ogMeta'

const meta = (attr: string) => indexHtml.match(new RegExp(`<meta ${attr} content="([^"]*)"`))?.[1]

describe('siteOrigin', () => {
  it('prefers SITE_URL and drops the trailing slash', () => {
    expect(siteOrigin({ SITE_URL: 'https://chronograma.app/', VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' })).toBe(
      'https://chronograma.app',
    )
  })
  it('falls back to the Vercel production domain', () => {
    expect(siteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'chronograma.vercel.app' })).toBe('https://chronograma.vercel.app')
  })
  it('is null without either', () => {
    expect(siteOrigin({ SITE_URL: ' ' })).toBeNull()
  })
})

describe('absolutizeOgUrls', () => {
  it('makes og:url, og:image and twitter:image absolute', () => {
    const html = absolutizeOgUrls(indexHtml, 'https://chronograma.app')
    expect(html).toContain('<meta property="og:url" content="https://chronograma.app/" />')
    expect(html).toContain('<meta property="og:image" content="https://chronograma.app/og.png" />')
    expect(html).toContain('<meta name="twitter:image" content="https://chronograma.app/og.png" />')
    // ほかの属性（アイコン・manifest）はそのまま
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
  })
  it('leaves the html as is without an origin', () => {
    expect(absolutizeOgUrls(indexHtml, null)).toBe(indexHtml)
  })
})

describe('index.html preview tags', () => {
  it('has a title, the one-sentence description and a 1200x630 image', () => {
    expect(meta('property="og:title"')).toBe('Chronograma — 予定と実際のずれが見える時間割')
    expect(meta('property="og:description"')).toBe(meta('name="description"'))
    expect(meta('name="twitter:card"')).toBe('summary_large_image')
    expect(meta('property="og:image"')).toBe('/og.png')
    expect(meta('property="og:image:width"')).toBe('1200')
    expect(meta('property="og:image:height"')).toBe('630')
    // PNG の IHDR の幅・高さ
    const png = new DataView(Uint8Array.from(atob(ogPng.split(',')[1] ?? ''), (c) => c.charCodeAt(0)).buffer)
    expect([png.getUint32(16), png.getUint32(20)]).toEqual([1200, 630])
  })
})
