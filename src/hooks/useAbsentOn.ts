import { useMemo } from 'react'
import { absentOnOf } from '../lib/schoolTerms'
import type { AbsentOn } from '../lib/unrecordedGaps'
import { useSchool } from './useSchool'

/** 予定（授業）のその回を欠席にしたか（その日の学期の欠席の印）。記録の無い時間で、欠席した回の時間を埋めない */
export function useAbsentOn(): AbsentOn {
  const school = useSchool()
  return useMemo(() => absentOnOf(school), [school])
}
