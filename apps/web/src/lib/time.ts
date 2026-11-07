import { useEffect, useState } from 'react';

/**
 * Server clock offset in ms (server minus client), from a response's ISO `serverTime` and the
 * client time the response arrived. With TanStack Query pass `query.dataUpdatedAt`:
 *
 *   const offset = computeServerOffset(contest.serverTime, contestQuery.dataUpdatedAt);
 *   <Countdown to={contest.endsAt} serverOffsetMs={offset} />
 */
export function computeServerOffset(serverTime: string, receivedAt: number = Date.now()): number {
  const server = Date.parse(serverTime);
  if (!Number.isFinite(server) || !Number.isFinite(receivedAt)) return 0;
  return server - receivedAt;
}

/** Current time in ms, re-rendering every `intervalMs` (aligned to whole intervals). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, intervalMs - (Date.now() % intervalMs));
    };
    timer = setTimeout(tick, intervalMs - (Date.now() % intervalMs));
    return () => clearTimeout(timer);
  }, [intervalMs]);
  return now;
}
