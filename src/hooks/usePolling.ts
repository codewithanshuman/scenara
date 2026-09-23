import { useCallback, useEffect, useRef, useState } from 'react'

export interface PollingState<T> {
  data?: T
  error?: Error
  loading: boolean
  refreshing: boolean
  updatedAt?: number
  refresh(): Promise<T | undefined>
}

export interface PollingOptions<T> {
  interval?: number
  enabled?: boolean
  immediate?: boolean
  retainDataOnError?: boolean
  pauseWhenHidden?: boolean
  onData?: (data: T) => void
  shouldContinue?: (data: T) => boolean
}

export function usePolling<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  dependencies: unknown[],
  options: PollingOptions<T> = {},
): PollingState<T> {
  const {
    interval = 5_000,
    enabled = true,
    immediate = true,
    retainDataOnError = true,
    pauseWhenHidden = true,
    onData,
    shouldContinue,
  } = options
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(immediate && enabled)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number>()
  const mounted = useRef(true)
  const running = useRef(false)
  const controller = useRef<AbortController | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const loaderRef = useRef(loader)
  const onDataRef = useRef(onData)
  const shouldContinueRef = useRef(shouldContinue)
  loaderRef.current = loader
  onDataRef.current = onData
  shouldContinueRef.current = shouldContinue

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = undefined
  }

  const refresh = useCallback(async (): Promise<T | undefined> => {
    if (!enabled || running.current) return undefined
    running.current = true
    clearTimer()
    controller.current?.abort()
    const active = new AbortController()
    controller.current = active
    setRefreshing(true)
    try {
      const next = await loaderRef.current(active.signal)
      if (!mounted.current || active.signal.aborted) return undefined
      setData(next)
      setError(undefined)
      setUpdatedAt(Date.now())
      onDataRef.current?.(next)
      return next
    } catch (cause) {
      if (active.signal.aborted || !mounted.current) return undefined
      const nextError = cause instanceof Error ? cause : new Error(String(cause))
      setError(nextError)
      if (!retainDataOnError) setData(undefined)
      return undefined
    } finally {
      if (mounted.current) {
        setLoading(false)
        setRefreshing(false)
      }
      running.current = false
    }
  }, [enabled, retainDataOnError])

  useEffect(() => {
    mounted.current = true
    setLoading(immediate && enabled)
    if (!enabled) return () => { mounted.current = false }
    let disposed = false

    const schedule = (next?: T) => {
      if (disposed) return
      if (next !== undefined && shouldContinueRef.current && !shouldContinueRef.current(next)) return
      clearTimer()
      timer.current = setTimeout(async () => {
        if (disposed) return
        if (pauseWhenHidden && document.visibilityState === 'hidden') { schedule(); return }
        const value = await refresh()
        schedule(value)
      }, interval)
    }

    const start = async () => {
      const value = immediate ? await refresh() : undefined
      schedule(value)
    }
    void start()
    return () => {
      disposed = true
      mounted.current = false
      clearTimer()
      controller.current?.abort()
    }
    // Dependencies intentionally control the complete polling lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, immediate, interval, pauseWhenHidden, refresh, ...dependencies])

  return { data, error, loading, refreshing, updatedAt, refresh }
}
