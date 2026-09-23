import { useEffect, useState } from 'react';
import { getServerNow } from '@/utils/serverTime';

/** Server-offset clock that re-renders every `intervalMs`; pass null to stop ticking. */
export function useServerNow(intervalMs: number | null): number {
  const [now, setNow] = useState(getServerNow);
  useEffect(() => {
    if (intervalMs == null) return;
    const id = setInterval(() => setNow(getServerNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
