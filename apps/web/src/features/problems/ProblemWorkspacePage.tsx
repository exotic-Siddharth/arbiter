import { ContestDetailSchema, ProblemDetailSchema } from '@arbiter/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useParams } from 'react-router';
import { ButtonLink, ErrorState } from '@/components/ui';
import { api, isApiError } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { computeServerOffset } from '@/lib/time';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { Workspace } from './components/Workspace';
import { WorkspaceSkeleton } from './components/WorkspaceSkeleton';

/**
 * /problems/:slug and /contests/:slug/problems/:label: the problem workspace. The shell gives
 * these routes a full-height layout; the workspace scrolls its own panels at lg+.
 */
export function Component() {
  const { slug = '', label } = useParams();
  const contestMode = label !== undefined;

  const contestQuery = useQuery({
    queryKey: qk.contests.detail(slug),
    queryFn: ({ signal }) =>
      api.get(`/contests/${encodeURIComponent(slug)}`, { schema: ContestDetailSchema, signal }),
    enabled: contestMode,
  });

  const problemQuery = useQuery({
    queryKey: contestMode ? qk.contests.problem(slug, label) : qk.problems.detail(slug),
    queryFn: ({ signal }) =>
      api.get(
        contestMode
          ? `/contests/${encodeURIComponent(slug)}/problems/${encodeURIComponent(label)}`
          : `/problems/${encodeURIComponent(slug)}`,
        { schema: ProblemDetailSchema, signal },
      ),
  });

  const problem = problemQuery.data;
  const contest = contestQuery.data;
  useDocumentTitle(
    problem
      ? contestMode
        ? `${label}. ${problem.title}${contest ? ` · ${contest.title}` : ''}`
        : problem.title
      : contestMode
        ? `Problem ${label}`
        : 'Problem',
  );

  const pending = problemQuery.isPending || (contestMode && contestQuery.isPending);
  if (pending) return <WorkspaceSkeleton />;

  const error = problemQuery.error ?? (contestMode ? contestQuery.error : null);
  if (!problem || error || (contestMode && !contest)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 pb-16">
        <ErrorState
          error={error}
          title={isApiError(error) && error.status === 404 ? 'Problem not found' : undefined}
          onRetry={
            isApiError(error) && error.status === 404
              ? undefined
              : () => {
                  void problemQuery.refetch();
                  if (contestMode) void contestQuery.refetch();
                }
          }
          retrying={problemQuery.isFetching || contestQuery.isFetching}
        />
        <ButtonLink
          to={contestMode ? `/contests/${encodeURIComponent(slug)}` : '/problems'}
          variant="ghost"
          size="sm"
          leftIcon={<ArrowLeft />}
        >
          {contestMode ? 'Back to the contest' : 'Back to problems'}
        </ButtonLink>
      </div>
    );
  }

  return (
    <Workspace
      key={contestMode ? `${slug}/${label}` : problem.slug}
      problem={problem}
      contest={
        contestMode && contest
          ? {
              detail: contest,
              label,
              serverOffsetMs: computeServerOffset(contest.serverTime, contestQuery.dataUpdatedAt),
              onPhaseChange: () => {
                void contestQuery.refetch();
              },
            }
          : undefined
      }
    />
  );
}

export default Component;
