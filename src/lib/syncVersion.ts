/**
 * 同期の取り決めの版（整数）。送り方・合わせ方を前の版のアプリと両立しない形に変えたら 1 つ上げ、
 * サーバーの下限（`app_config.min_sync_version`、017）もそれに合わせて上げる。
 * 下限より古いアプリは同期で送らず、「新しい版を読み込む」を出す（古い版が端末の時計で書き勝たないように）
 */
export const SYNC_PROTOCOL_VERSION = 1

/** サーバーが断った理由が「アプリの版が古い」か（017 のトリガーのエラー） */
export const isAppOutdatedError = (message: string | undefined) => !!message && message.includes('app_outdated')
