'use client';
import { useEffect } from 'react';

/**
 * Poll `cb` every `ms` while the tab is visible. Used by the role panels
 * so queues stay current without a manual reload. Cleared on unmount.
 */
export function usePanelRefresh(cb: () => void, ms = 60_000) {
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) cb();
    };
    const onVis = () => {
      if (!document.hidden) cb();
    };
    const id = setInterval(tick, ms);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [cb, ms]);
}
