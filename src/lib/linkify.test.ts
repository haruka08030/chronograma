import { describe, expect, it } from 'vitest'
import { htmlToPlainText, shortUrlLabel } from './linkify'

describe('shortUrlLabel', () => {
  it('drops the scheme, www and a trailing slash from a short URL', () => {
    expect(shortUrlLabel('https://www.example.com/')).toBe('example.com')
    expect(shortUrlLabel('https://github.com/haruka08030/chronograma')).toBe('github.com/haruka08030/chronograma')
  })

  it('cuts a long URL after its first path segment', () => {
    expect(shortUrlLabel('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit?usp=sharing')).toBe('docs.google.com/document/…')
  })

  it('shortens a long first segment and a long URL without a path', () => {
    expect(shortUrlLabel(`https://example.com/${'a'.repeat(30)}/b`)).toBe(`example.com/${'a'.repeat(20)}…/…`)
    expect(shortUrlLabel(`https://example.com/?q=${'x'.repeat(40)}`)).toBe('example.com/…')
  })

  it('returns text that is not a URL unchanged', () => {
    expect(shortUrlLabel('not a url')).toBe('not a url')
  })
})

describe('htmlToPlainText', () => {
  it('leaves plain text as it is', () => {
    expect(htmlToPlainText('  持ち物: 筆記用具\nhttps://a.example/x  ')).toBe('持ち物: 筆記用具\nhttps://a.example/x')
  })

  it('keeps line breaks and turns entities back into characters', () => {
    expect(htmlToPlainText('A &amp; B<br>C&nbsp;&lt;D&gt;<br/>&#39;E&#x27;')).toBe("A & B\nC <D>\n'E'")
  })

  it('keeps the URL of a link so it can be opened', () => {
    expect(htmlToPlainText('<a href="https://zoom.us/j/123">https://zoom.us/j/123</a>')).toBe('https://zoom.us/j/123')
    expect(htmlToPlainText('会場: <a href="https://maps.example/x?a=1&amp;b=2">地図</a>')).toBe('会場: 地図 https://maps.example/x?a=1&b=2')
  })

  it('puts paragraphs and list items on their own lines', () => {
    expect(htmlToPlainText('<p>一</p><p>二</p><ul><li>a</li><li>b</li></ul>')).toBe('一\n二\n\n・a\n・b')
  })
})
