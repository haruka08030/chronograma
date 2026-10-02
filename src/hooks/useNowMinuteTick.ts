import { useEffect, useState } from 'react'
import { zonedNow } from '../lib/timeZone'

export function useNowMinuteTick(): Date {
  const [now, setNow] = useState(() => zonedNow())

  useEffect(() => {
    const id = setInterval(() => setNow(zonedNow()), 60_000)
    return () => clearInterval(id)
  }, [])

  return now
}
