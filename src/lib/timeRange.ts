/** 時刻の範囲の書き方（「15:00–16:30」）。アプリのどこでもこの形にする */
export const timeRange = (start: string | null, end: string | null): string => `${start}–${end}`
