/**
 * 端末の保存データを読み終えて（`open`）から、アプリ（ストア・同期・画面）を読み込む（`start`）。
 * 読めなかったときも localStorage のまま始める（`openDataStore` は失敗しても投げないが、念のため）。
 * アプリ本体が読めなかった（オフラインでまだ保存していない・デプロイ直後）ときは `onStartFailed` に渡す（真っ白のまま止めない）
 */
export async function startAfterDataLoaded(
  open: () => Promise<unknown>,
  start: () => Promise<unknown>,
  onStartFailed?: (err: unknown) => void,
): Promise<void> {
  try {
    await open()
  } catch {
    /* localStorage のまま */
  }
  try {
    await start()
  } catch (err) {
    if (!onStartFailed) throw err
    onStartFailed(err)
  }
}
