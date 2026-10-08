import { useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTaskStore } from '../store/taskStore'
import { requestPersistentStorage } from '../lib/persistentStorage'

/**
 * ログインしていない人のデータはこのブラウザにしか無い（Safari はしばらく開かないサイトのデータを消すことがある）。
 * 何か入っていれば、起動時に保存領域を消されにくくしてほしいと頼む（端末ごとに 1 回。ログイン中は最初の同期のあとに頼む）。
 * まだ何も入っていない初めての人には、確かめの表示を出さない
 */
export function usePersistLocalData() {
  const { user, loading } = useAuth()
  const hasData = useTaskStore((s) => s.tasks.length > 0)
  const signedOut = !loading && !user
  useEffect(() => {
    if (signedOut && hasData) void requestPersistentStorage()
  }, [signedOut, hasData])
}
