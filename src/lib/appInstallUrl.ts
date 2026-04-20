/** 配布ページやストアへの URL。未設定時は「アプリを入手する」を無効化する。 */
export function getAppInstallUrl(): string | undefined {
  const v = import.meta.env.VITE_APP_INSTALL_URL as string | undefined
  const t = v?.trim()
  return t || undefined
}
