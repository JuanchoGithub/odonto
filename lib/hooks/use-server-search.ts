'use client';

import { useEffect, useRef, useState } from 'react';

type Options<T> = {
  /**
   * Loads items for a trimmed query. An empty string means "default list"
   * (no filter applied yet). Must resolve to an array; throw/reject on error.
   */
  fetchItems: (q: string, signal: AbortSignal) => Promise<T[]>;
  /** Debounce delay in ms (default 300). */
  delayMs?: number;
  /**
   * Gate fetching (e.g. only while a dropdown is open). When it flips to
   * true, a fetch fires immediately with the current query.
   */
  enabled?: boolean;
  /** Extra values that trigger a refetch with the current query when changed. */
  refreshDeps?: readonly unknown[];
};

/**
 * Debounced, server-driven search with stale-response protection.
 *
 * Replaces the "fetch first 200 once, filter client-side" pattern used by the
 * patient/insurer pickers: typing fires a cancellable request after `delayMs`
 * and only the latest request may write state, so slow out-of-order responses
 * never clobber newer results.
 */
export function useServerSearch<T>({
  fetchItems,
  delayMs = 300,
  enabled = true,
  refreshDeps = [],
}: Options<T>) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  // Monotonic request id — only the latest request may write state.
  const seq = useRef(0);
  // Always call the latest fetchItems without retriggering the effect.
  const fetchRef = useRef(fetchItems);
  fetchRef.current = fetchItems;

  useEffect(() => {
    if (!enabled) return;
    const id = ++seq.current;
    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetchRef
        .current(query.trim(), ctrl.signal)
        .then((data) => {
          if (seq.current !== id) return;
          setItems(Array.isArray(data) ? data : []);
          setLoading(false);
        })
        .catch(() => {
          if (seq.current !== id) return;
          setItems([]);
          setLoading(false);
        });
    }, delayMs);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, query, delayMs, ...refreshDeps]);

  return { query, setQuery, items, setItems, loading };
}
