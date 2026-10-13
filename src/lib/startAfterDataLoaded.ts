/**
 * 端末の保存データを読み終えて（`open`）から、アプリ（ストア・同期・画面）を読み込む（`start`）。
 * 読めなかったときも localStorage のまま始める（`openDataStore` は失敗しても投げないが、念のため）
 */
export async function startAfterDataLoaded(open: () => Promise<unknown>, start: () => Promise<unknown>): Promise<void> {
  try {
    await open()
  } catch {
    /* localStorage のまま */
  }
  await start()
}
