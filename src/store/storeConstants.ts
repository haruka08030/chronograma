/** ストアの定数。保存形式（キー・版）を変えるときはここと `migrate.ts` を合わせて直す */

export const INBOX_COLOR = '#7986CB'

export const INBOX_ID = '__inbox__'
export const INBOX_LIST_ID = INBOX_ID

/** 時間バーに並べられる別のタイムゾーンの数（多いとタイムラインが狭くなる） */
export const MAX_EXTRA_TIME_ZONES = 2

export const PERSIST_STORAGE_KEY = 'chronograma-storage'
/** 保存形式の版。上げたら migrate に手順を足す */
export const STORE_VERSION = 40
export const LEGACY_PERSIST_STORAGE_KEY = 'tickdo-storage'

/**
 * `dataOwner` の値。この印を付ける前の版から引き継いだデータで、誰のものか記録が無い。
 * その端末でこれまでどおり同期していた本人のものとして扱う
 */
export const LEGACY_DATA_OWNER = '*legacy*'
