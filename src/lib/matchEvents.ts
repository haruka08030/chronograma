import type { Task } from '../types/task'
import type { PlannedItem } from '../types/plannedItem'
import { timeToMinutes } from './timeGrid'

export type MatchStatus = 'matched' | 'time-drift' | 'planned-only' | 'actual-only'

export interface MatchedPair {
  status: MatchStatus
  planned?: PlannedItem
  actual?: Task
  driftMinutes?: number
}

function titleSimilarity(a: string, b: string): number {
  const na = a.toLowerCase().trim()
  const nb = b.toLowerCase().trim()
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.8

  const wordsA = new Set(na.split(/\s+/))
  const wordsB = new Set(nb.split(/\s+/))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let overlap = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++
  }
  return overlap / Math.max(wordsA.size, wordsB.size)
}

function timeOverlapRatio(pStart: string, pEnd: string, aStart: string, aEnd: string): number {
  const ps = timeToMinutes(pStart)
  const pe = timeToMinutes(pEnd)
  const as_ = timeToMinutes(aStart)
  const ae = timeToMinutes(aEnd)

  const overlapStart = Math.max(ps, as_)
  const overlapEnd = Math.min(pe, ae)
  const overlap = Math.max(0, overlapEnd - overlapStart)

  const union = Math.max(pe, ae) - Math.min(ps, as_)
  if (union === 0) return 0
  return overlap / union
}

const TITLE_THRESHOLD = 0.3
const TIME_OVERLAP_THRESHOLD = 0.15
const DRIFT_THRESHOLD_MINUTES = 10

/** 予定（Google・習慣・自分で配置したタスク）とタイムログを突き合わせる */
export function matchPlanAndActualForDate(planned: PlannedItem[], actualLogs: Task[]): MatchedPair[] {
  const timedPlanned = planned.filter((e) => e.startTime && e.endTime)
  const timedActual = actualLogs.filter((t) => t.startTime && t.endTime)

  const usedPlanned = new Set<string>()
  const usedActual = new Set<string>()
  const pairs: MatchedPair[] = []

  interface Candidate {
    pIdx: number
    aIdx: number
    score: number
  }
  const candidates: Candidate[] = []

  for (let pi = 0; pi < timedPlanned.length; pi++) {
    const p = timedPlanned[pi]
    for (let ai = 0; ai < timedActual.length; ai++) {
      const a = timedActual[ai]
      const tSim = titleSimilarity(p.summary, a.title)
      if (tSim < TITLE_THRESHOLD) continue

      const overlap = timeOverlapRatio(p.startTime, p.endTime, a.startTime!, a.endTime!)
      if (overlap < TIME_OVERLAP_THRESHOLD && tSim < 0.8) continue

      candidates.push({ pIdx: pi, aIdx: ai, score: tSim * 0.6 + overlap * 0.4 })
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  for (const c of candidates) {
    const p = timedPlanned[c.pIdx]
    const a = timedActual[c.aIdx]
    const pKey = p.id ?? `planned-${c.pIdx}`
    const aKey = a.id ?? `actual-${c.aIdx}`
    if (usedPlanned.has(pKey) || usedActual.has(aKey)) continue
    usedPlanned.add(pKey)
    usedActual.add(aKey)

    const startDrift = Math.abs(timeToMinutes(p.startTime) - timeToMinutes(a.startTime!))
    const endDrift = Math.abs(timeToMinutes(p.endTime) - timeToMinutes(a.endTime!))
    const maxDrift = Math.max(startDrift, endDrift)

    if (maxDrift <= DRIFT_THRESHOLD_MINUTES) {
      pairs.push({ status: 'matched', planned: p, actual: a })
    } else {
      pairs.push({ status: 'time-drift', planned: p, actual: a, driftMinutes: maxDrift })
    }
  }

  for (const p of timedPlanned) {
    if (!usedPlanned.has(p.id)) {
      pairs.push({ status: 'planned-only', planned: p })
    }
  }

  for (const a of timedActual) {
    if (!usedActual.has(a.id)) {
      pairs.push({ status: 'actual-only', actual: a })
    }
  }

  return pairs
}
