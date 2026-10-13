/**
 * ほかのアプリの「共有」（manifest の `share_target`、`/?add=1&title=…&text=…&url=…`）と、
 * 追加欄に貼った URL の扱い。
 * - URL は題名に入れず、足すときにメモ（`description`）へ分ける（`splitUrls`。共有でも貼り付けでも同じ部品）
 * - 共有は追加欄に入れた状態で開くだけで、その場では足さない（利用者が確かめてから追加）
 */

/** 追加欄に共有の中身を入れて開くときの中身 */
export type QuickAddPrefill = {
  /** 追加欄に入れる 1 行（「タイトル URL」） */
  text: string
  /** 1 行に収まらない共有の本文。足すとメモの先頭に入る（URL はその下） */
  note: string
}

/** 共有で追加欄に入れる 1 行の長さの上限（文字）。超える本文は先頭だけを欄に入れ、全文はメモへ */
export const SHARED_LINE_MAX = 100

// 文中の URL。日本語の文に続けて書かれても URL に含めないよう、URL に使える ASCII の文字だけを拾う
const URL_IN_TEXT = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g

/** URL の後ろに付いた句読点・閉じかっこ（対になる開きかっこが URL に無いもの）を外す */
function trimUrlTail(url: string): string {
  let u = url.replace(/[.,;:!?'"]+$/, '')
  while (u.endsWith(')') && (u.match(/\)/g)?.length ?? 0) > (u.match(/\(/g)?.length ?? 0)) u = u.slice(0, -1).replace(/[.,;:!?'"]+$/, '')
  return u
}

/** http(s) の URL として読めるか（`javascript:` などは通さない） */
function isWebUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 文から外した URL の跡に残る区切り（「説明会 - https://…」の「-」、「｜」「:」など）を行の端から外す。
 * 行末の開きかっこ（「募集 (https://…)」の「(」）も
 */
const EDGE_SEPARATORS = /^[\s\-–—|｜:：・/]+|[\s\-–—|｜:：・/(（「【[]+$/g

/**
 * 文から URL を取り出す。`rest` は URL を外した残り（行ごとに空白をまとめ、空の行は外す。改行は残す）。
 * URL は出てきた順で、同じものは 1 つにする
 */
export function splitUrls(text: string): { rest: string; urls: string[] } {
  const urls: string[] = []
  const rest = text
    .replace(URL_IN_TEXT, (match) => {
      const url = trimUrlTail(match)
      if (!isWebUrl(url)) return match
      if (!urls.includes(url)) urls.push(url)
      // URL の直後の句読点・かっこも一緒に外す（「詳細は https://… .」と残さない）
      return ' '
    })
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').replace(EDGE_SEPARATORS, ''))
    .filter(Boolean)
    .join('\n')
  return { rest, urls }
}

/** 文字数（サロゲートペアを 1 文字）で切る。切ったら「…」を付ける */
function clip(s: string, max: number): string {
  const chars = Array.from(s)
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : s
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()
const fits = (s: string) => !s.includes('\n') && Array.from(s).length <= SHARED_LINE_MAX

/**
 * 共有の `title`・`text`・`url` → 追加欄に入れる中身。何も無ければ null。
 * - URL は `url` が空でも `text`・`title` の中から取り出す（Android の多くのアプリは URL を `text` で送る）。欄の末尾に並べ、足すとメモに分かれる
 * - 題名は `title`。`text` が題名と同じ・題名を含むなら重ねない。短い 1 行の `text` は題名の後ろに足す
 * - 長い・複数行の本文は欄に入れず（題名が無ければ 1 行目の先頭だけ）、全文をメモへ
 * - 日付・時刻の読み取りは欄の 1 行（題名と短い本文）だけ。URL の `/2026/10/15/` やメモに回した本文は読まない
 */
export function sharedQuickAdd(params: { title?: string | null; text?: string | null; url?: string | null }): QuickAddPrefill | null {
  const head = splitUrls(params.title ?? '')
  const body = splitUrls(params.text ?? '')
  const shared = (params.url ?? '').trim()
  const urls: string[] = []
  for (const u of [...(isWebUrl(shared) ? [shared] : []), ...head.urls, ...body.urls]) if (!urls.includes(u)) urls.push(u)

  const title = oneLine(head.rest)
  const text = body.rest
  const textLine = oneLine(text)
  let line = title
  let note = ''
  if (title && !fits(title)) {
    // 題名だけで長すぎる（ふつうは無い）ときは先頭だけ欄に入れ、全文はメモへ
    line = clip(title, SHARED_LINE_MAX)
    note = title
  }
  if (textLine && !title.includes(textLine)) {
    if (!title) {
      line = fits(text) ? text : clip(text.split('\n')[0]!, SHARED_LINE_MAX)
      if (!fits(text)) note = text
    } else if (fits(text)) {
      line = textLine.includes(title) ? textLine : `${line} ${textLine}`
    } else {
      note = note ? `${note}\n\n${text}` : text
    }
  }
  if (!line && urls.length === 0 && !note) return null
  return { text: [line, ...urls].filter(Boolean).join(' '), note }
}
