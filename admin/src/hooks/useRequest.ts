import { useEffect, useState } from 'react'

interface Settled<T> {
  fn: (signal: AbortSignal) => Promise<T>
  nonce: number
  data: T | null
  error: Error | null
}

/**
 * Runs `fn` when it changes (wrap it in useCallback) or when reload() is called. While a new request is in
 * flight the previous data stays available so lists do not flash empty.
 */
export function useRequest<T>(fn: (signal: AbortSignal) => Promise<T>) {
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<Settled<T> | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fn(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ fn, nonce, data, error: null })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ fn, nonce, data: null, error: error instanceof Error ? error : new Error(String(error)) })
        }
      },
    )
    return () => controller.abort()
  }, [fn, nonce])

  const settled = state !== null && state.fn === fn && state.nonce === nonce
  return {
    data: state?.data ?? null,
    error: settled ? state.error : null,
    loading: !settled,
    reload: () => setNonce((n) => n + 1),
  }
}
