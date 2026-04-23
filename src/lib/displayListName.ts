import i18n from '../i18n/config'

/** `taskStore` の受信トレイ ID と一致させる */
const INBOX_LIST_ID = '__inbox__'

/** 受信トレイ相当のリスト名を現在言語で返す */
export function displayListName(listId: string, storedName: string): string {
  if (listId === INBOX_LIST_ID) return i18n.t('lists.inbox')
  return storedName
}
