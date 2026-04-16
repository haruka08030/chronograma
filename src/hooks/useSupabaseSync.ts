import { useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getSupabase } from '../lib/supabase'
import { decideHydrate, fetchListsTasksHabits, pushListsTasksHabits } from '../lib/supabaseData'
import { useTaskStore, INBOX_LIST_ID } from '../store/taskStore'

const DEBOUNCE_MS = 1800

export function useSupabaseSync() {
  const { user, loading } = useAuth()
  const userId = user?.id ?? null
  const hydratingRef = useRef(false)

  useEffect(() => {
    if (!userId || loading) return

    const supabase = getSupabase()
    if (!supabase) return

    let cancelled = false

    const run = async () => {
      hydratingRef.current = true
      try {
        const remote = await fetchListsTasksHabits(supabase, userId)
        if (cancelled) return
        if ('error' in remote) {
          console.error('[sync]', remote.error)
          return
        }

        const local = useTaskStore.getState()
        const decision = decideHydrate(
          remote.lists,
          remote.tasks,
          remote.habits,
          local.lists,
          local.tasks,
          local.habits,
        )

        if (decision.kind === 'push_local') {
          const res = await pushListsTasksHabits(supabase, userId, local.lists, local.tasks, local.habits)
          if (res.error) console.error('[sync]', res.error)
          if (cancelled) return
        } else {
          if (cancelled) return
          const listIds = new Set(decision.lists.map((l) => l.id))
          const sel = local.selectedListId
          useTaskStore.setState({
            tasks: decision.tasks,
            lists: decision.lists,
            habits: decision.habits,
            selectedListId: sel && listIds.has(sel) ? sel : INBOX_LIST_ID,
          })
        }
      } finally {
        queueMicrotask(() => {
          hydratingRef.current = false
        })
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [userId, loading])

  useEffect(() => {
    if (!userId || loading) return
    const supabase = getSupabase()
    if (!supabase) return

    let timer: ReturnType<typeof setTimeout>
    let cancelled = false

    const unsub = useTaskStore.subscribe((state, prev) => {
      if (state.tasks === prev.tasks && state.lists === prev.lists && state.habits === prev.habits) return
      if (hydratingRef.current) return

      clearTimeout(timer)
      timer = setTimeout(() => {
        if (cancelled) return
        const s = useTaskStore.getState()
        void (async () => {
          const res = await pushListsTasksHabits(supabase, userId, s.lists, s.tasks, s.habits)
          if (!cancelled && res.error) console.error('[sync]', res.error)
        })()
      }, DEBOUNCE_MS)
    })

    return () => {
      cancelled = true
      clearTimeout(timer)
      unsub()
    }
  }, [userId, loading])
}
