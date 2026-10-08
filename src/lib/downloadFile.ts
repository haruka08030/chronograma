/** 文字をファイルにして保存させる（バックアップ・自動バックアップ・記録の書き出し） */
export function downloadTextFile(content: string, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
