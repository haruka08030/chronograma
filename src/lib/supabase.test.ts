import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signOutThisDevice } from './supabase'

function fakeClient(signOutError: Error | null) {
  const removeSession = vi.fn(async () => {})
  const signOut = vi.fn(async () => ({ error: signOutError }))
  const client = { auth: { signOut, _removeSession: removeSession } } as unknown as SupabaseClient
  return { client, signOut, removeSession }
}

describe('signOutThisDevice', () => {
  it('signs out only this device', async () => {
    const { client, signOut, removeSession } = fakeClient(null)
    await signOutThisDevice(client)
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(removeSession).not.toHaveBeenCalled()
  })

  it('still forgets the session on this device when offline', async () => {
    const { client, removeSession } = fakeClient(new TypeError('Failed to fetch'))
    await signOutThisDevice(client)
    expect(removeSession).toHaveBeenCalledOnce()
  })
})
