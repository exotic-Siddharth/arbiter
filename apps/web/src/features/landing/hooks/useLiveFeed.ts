import {
  SubmissionPageSchema,
  type FeedJudgedEvent,
  type Language,
  type Verdict,
} from '@arbiter/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { useRoom, useSocketEvent } from '@/lib/socket';

/** Items kept in the landing feed (live events and the initial list together). */
export const FEED_LIMIT = 12;
const SEED_SIZE = 10;

export interface FeedItem {
  key: string;
  username: string;
  problemSlug: string;
  problemTitle: string;
  language: Language;
  verdict: Verdict;
  timeMs: number | null;
  at: string;
}

const identity = (item: Pick<FeedItem, 'username' | 'problemSlug' | 'at'>) =>
  item.username + '|' + item.problemSlug + '|' + item.at;

export interface LiveFeed {
  items: FeedItem[];
  /** The initial list request (loading and error states for the card). */
  seed: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    isFetching: boolean;
    refetch: () => unknown;
  };
}

/**
 * Recently judged submissions, newest first: the latest judged practice submissions over REST,
 * with `feed:judged` socket events prepended as they arrive (R6: joined through useRoom, which
 * also refetches the list after every connect so a reconnect fills any gap).
 */
export function useLiveFeed(): LiveFeed {
  const seedKey = qk.submissions.list({ scope: 'landing-feed', pageSize: SEED_SIZE });
  useRoom('feed:subscribe', {}, { invalidate: [seedKey] });

  const seed = useQuery({
    queryKey: seedKey,
    queryFn: ({ signal }) =>
      api.get('/submissions', {
        query: { pageSize: SEED_SIZE },
        schema: SubmissionPageSchema,
        signal,
      }),
    staleTime: 30_000,
  });

  const [live, setLive] = useState<FeedItem[]>([]);
  const counter = useRef(0);
  useSocketEvent('feed:judged', (event: FeedJudgedEvent) => {
    counter.current += 1;
    const item: FeedItem = { ...event, key: 'live-' + counter.current };
    setLive((current) => [item, ...current].slice(0, FEED_LIMIT));
  });

  const seeded = seed.data;
  const items = useMemo(() => {
    const fromRest: FeedItem[] = (seeded?.items ?? []).flatMap((submission) =>
      submission.verdict && submission.status === 'DONE' && submission.contestSlug === null
        ? [
            {
              key: submission.id,
              username: submission.user.username,
              problemSlug: submission.problem.slug,
              problemTitle: submission.problem.title,
              language: submission.language,
              verdict: submission.verdict,
              timeMs: submission.timeMs,
              at: submission.judgedAt ?? submission.createdAt,
            },
          ]
        : [],
    );
    const seen = new Set<string>();
    return [...live, ...fromRest]
      .filter((item) => {
        const id = identity(item);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, FEED_LIMIT);
  }, [live, seeded]);

  return { items, seed };
}
