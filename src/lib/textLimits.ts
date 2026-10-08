/**
 * 書ける長さの上限（DB の `001_chronograma_schema.sql` の *_size_check と同じ）。入力欄の `maxLength` に使う。
 * 超えた行はサーバーに断られる（送るときに切らない）。`maxLength` は UTF-16 の単位で数え、DB の `length()` は文字で数えるので、
 * 入力で止めた長さは必ず DB の上限に収まる
 */
/** タスク・記録・習慣の題名（`tasks.title`・`habits.title`） */
export const TITLE_MAX_LENGTH = 2000
/** タスク・記録のメモ（`tasks.description`） */
export const DESCRIPTION_MAX_LENGTH = 200_000
/** 場所（`tasks.location`） */
export const LOCATION_MAX_LENGTH = 2000
/** リスト・セクションの名前（`lists.name`・`list_sections.name`） */
export const NAME_MAX_LENGTH = 500
/** 記録の分類（ラベル）の名前（`tasks.category`） */
export const CATEGORY_MAX_LENGTH = 200
