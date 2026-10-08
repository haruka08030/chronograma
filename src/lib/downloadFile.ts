/** ファイルを保存させる（バックアップ・自動バックアップ・記録の書き出し・ふりかえりの画像） */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/** 文字をファイルにして保存させる */
export function downloadTextFile(content: string, fileName: string, type: string): void {
  downloadBlob(new Blob([content], { type }), fileName)
}
