import { ArrowLeft } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Countdown } from '@/components';
import { Page } from '@/components/layout/Page';
import { LiveScoreboard } from './components/LiveScoreboard';
import { ContestStatusBadge } from './components/ContestStatusBadge';
import { useContest } from './hooks/useContest';

/** /contests/:slug/scoreboard: the full live ICPC table with pagination (spec 13.2). */
export function Component() {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { contest, boundary, offsetMs, onBoundary } = useContest(slug);

  const eyebrow = (
    <Link
      to={`/contests/${encodeURIComponent(slug)}`}
      className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft aria-hidden="true" className="size-3.5" />
      {contest?.title ?? 'Contest'}
    </Link>
  );

  return (
    <Page
      title="Scoreboard"
      documentTitle={contest ? `Scoreboard · ${contest.title}` : 'Scoreboard'}
      eyebrow={eyebrow}
      width="full"
      className="max-w-[96rem]"
      actions={
        contest && boundary ? (
          <div className="flex items-center gap-3 text-sm text-muted">
            <ContestStatusBadge status={boundary.phase} size="md" />
            {boundary.target ? (
              <span className="flex items-center gap-1.5">
                {boundary.label}
                <Countdown
                  to={boundary.target}
                  serverOffsetMs={offsetMs}
                  onComplete={onBoundary}
                  label={boundary.spoken}
                  className="font-semibold text-foreground"
                />
              </span>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <LiveScoreboard
        slug={slug}
        page={page}
        notStarted={boundary?.phase === 'UPCOMING'}
        onPageChange={(next) => {
          const search = new URLSearchParams(params);
          search.set('page', String(next));
          setParams(search);
        }}
        tableClassName="max-h-[calc(100dvh-15rem)] min-h-48"
      />
    </Page>
  );
}

export default Component;
