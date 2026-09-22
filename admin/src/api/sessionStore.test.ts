import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionStorageStore } from './sessionStore'
import { storedSession } from '../test/fakeApi'

afterEach(() => vi.restoreAllMocks())

describe('sessionStorageStore', () => {
  it('round-trips a session through sessionStorage and never touches localStorage', () => {
    const session = storedSession(3, 123)
    sessionStorageStore.save(session)
    expect(sessionStorageStore.load()).toEqual(session)
    expect(localStorage.length).toBe(0)
    sessionStorageStore.clear()
    expect(sessionStorageStore.load()).toBeNull()
  })

  it('ignores stored data that is not a session', () => {
    sessionStorage.setItem('hs-admin-session', '{"tokens": 5}')
    expect(sessionStorageStore.load()).toBeNull()
    sessionStorage.setItem('hs-admin-session', 'not json')
    expect(sessionStorageStore.load()).toBeNull()
  })

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(() => sessionStorageStore.save(storedSession(1, 1))).not.toThrow()
    expect(sessionStorageStore.load()).toBeNull()
  })
})
