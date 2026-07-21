"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

interface ApiState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

/**
 * Minimal SWR-style hook: runs `fetcher` on mount and whenever `deps`
 * change, tracking loading/error state. `fetcher` should be stable
 * across renders that don't need a refetch (e.g. wrapped in useCallback).
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = [],
): ApiState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Unexpected error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { data, error, loading, refetch };
}
