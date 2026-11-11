import { ArrowLeft, Maximize2 } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Markdown } from '@/components/Markdown';
import { Page } from '@/components/layout/Page';
import {
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { isApiError } from '@/lib/api';
import { useCurrentUser } from '@/stores/auth';
import { ContestSkeleton } from './components/ContestSkeleton';
import { ContestHero } from './components/ContestHero';
import { ContestProblemsTable } from './components/ContestProblemsTable';
import { ContestSubmissions } from './components/ContestSubmissions';
import { LiveScoreboard } from './components/LiveScoreboard';
import { RegisterButton } from './components/RegisterButton';
import { useContest } from './hooks/useContest';
import { parsePageParam } from './lib/page';

type Tab = 'problems' | 'scoreboard' | 'submissions';

const backLink = (
  <Link
    to="/contests"
    className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <ArrowLeft aria-hidden="true" className="size-3.5" />
    Contests
  </Link>
);

/**
 * /contests/:slug: status and server-corrected countdown, register, then tabs Problems /
 * Scoreboard / My submissions. Before the start only the countdown and description show.
 */
export function Component() {
  const { slug = '' } = useParams();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const { query, contest, offsetMs, boundary, onBoundary } = useContest(slug);
  const scoreboardPage = parsePageParam(params.get('page'));

  if (query.isPending) {
    return (
      <Page title="Contest" eyebrow={backLink}>
        <ContestSkeleton />
      </Page>
    );
  }
  if (!contest || !boundary) {
    const notFound = isApiError(query.error) && query.error.status === 404;
    return (
      <Page title={notFound ? 'Contest not found' : 'Contest'} eyebrow={backLink}>
        {notFound ? (
          <EmptyState
            title="This contest does not exist"
            description="It may have been renamed, or it is not published yet."
            action={<ButtonLink to="/contests">All contests</ButtonLink>}
          />
        ) : (
          <ErrorState
            error={query.error}
            retrying={query.isFetching}
            onRetry={() => void query.refetch()}
          />
        )}
      </Page>
    );
  }

  const started = boundary.phase !== 'UPCOMING' && contest.problems !== null;
  const requested = params.get('tab');
  const tab: Tab =
    requested === 'scoreboard' || (requested === 'submissions' && user) ? requested : 'problems';
  const setTab = (value: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', value);
    if (value !== 'scoreboard') next.delete('page');
    setParams(next, { replace: true });
  };
  const description = contest.descriptionMd.trim();

  return (
    <Page
      title={contest.title}
      eyebrow={backLink}
      actions={<RegisterButton contest={{ ...contest, status: boundary.phase }} />}
    >
      <ContestHero
        contest={contest}
        boundary={boundary}
        offsetMs={offsetMs}
        onBoundary={onBoundary}
      />

      {description ? (
        <Card className="p-5 sm:p-6">
          <Markdown source={description} />
        </Card>
      ) : null}

      {started ? (
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <TabsList aria-label="Contest sections">
              <TabsTrigger value="problems" count={contest.problems?.length}>
                Problems
              </TabsTrigger>
              <TabsTrigger value="scoreboard">Scoreboard</TabsTrigger>
              {user ? <TabsTrigger value="submissions">My submissions</TabsTrigger> : null}
            </TabsList>
            {tab === 'scoreboard' ? (
              <ButtonLink
                to={`/contests/${encodeURIComponent(contest.slug)}/scoreboard`}
                variant="ghost"
                size="sm"
                leftIcon={<Maximize2 />}
              >
                Full scoreboard
              </ButtonLink>
            ) : null}
          </div>
          <TabsContent value="problems" className="pt-4">
            <Card className="overflow-hidden">
              {contest.problems && contest.problems.length > 0 ? (
                <ContestProblemsTable slug={contest.slug} problems={contest.problems} />
              ) : (
                <EmptyState compact title="No problems in this contest" />
              )}
            </Card>
          </TabsContent>
          <TabsContent value="scoreboard" className="pt-4">
            <LiveScoreboard
              slug={contest.slug}
              page={scoreboardPage}
              onPageChange={(page) => {
                const next = new URLSearchParams(params);
                next.set('page', String(page));
                setParams(next, { replace: true });
              }}
              tableClassName="max-h-[70vh]"
            />
          </TabsContent>
          {user ? (
            <TabsContent value="submissions" className="pt-4">
              <Card className="overflow-hidden">
                <ContestSubmissions slug={contest.slug} />
              </Card>
            </TabsContent>
          ) : null}
        </Tabs>
      ) : (
        <Card className="p-6 text-center text-sm text-muted">
          The problems are revealed when the contest starts. Register now so you can submit from the
          first minute.
        </Card>
      )}
    </Page>
  );
}

export default Component;
