/**
 * 「なんとなく」の記録（#657）。課題と ES の行き来・AI への指示出し・雑用・スマホなど、何をしたか分からない時間を
 * ふつうのラベルとは別の選択肢 1 つで記録する。ラベル・色は持たず、ラベル別の時間・記録した時間に入れない。
 * 記録なしの時間と合わせて「なんとなく」の時間としてふりかえりの日別の棒に斜線で積む
 */
import { isLogTask, type Task } from '../types/task'

/** 「なんとなく」の記録か（睡眠・To-Do・予定は持たない） */
export function isVagueLog(t: Pick<Task, 'kind' | 'vague'>): boolean {
  return t.kind === 'log' && t.vague === true
}

/** ラベル別の時間・記録した時間に数える記録か（睡眠と「なんとなく」は数えない） */
export function isCountedLog(t: Pick<Task, 'kind' | 'vague'>): boolean {
  return t.kind === 'log' && t.vague !== true
}

/** サーバー・バックアップの値を読む */
export function readVague(raw: unknown): boolean {
  return raw === true || raw === 'true'
}

/**
 * 「なんとなく」の印をそろえる: 記録の行だけが持ち、持つ行はラベル・色を持たない。持たない行は項目ごと無い
 * （同期で「変わった」と見ないため）。何も変わらなければ同じオブジェクト
 */
export function withVague<T extends Task>(t: T, vague: boolean): T {
  if (vague && t.kind === 'log' && isLogTask(t)) {
    if (t.vague === true && t.category === null && t.tags.length === 0 && t.color === null && t.labelId === undefined) return t
    const out = { ...t, vague: true as const, category: null, tags: [], color: null }
    delete out.labelId
    return out
  }
  if (!('vague' in t)) return t
  const rest = { ...t }
  delete rest.vague
  return rest
}
