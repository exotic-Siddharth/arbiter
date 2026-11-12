import { AdminContestSchema, type AdminContestBody } from '@arbiter/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { Page } from '@/components/layout/Page';
import { Badge, ButtonLink, QueryState, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { toast } from '@/lib/toast';
import { PlagiarismRunCard, RatingsCard } from './ContestActions';
import { ContestForm } from './ContestForm';
import { contestToForm } from '../lib/contestForm';

const PENDING_POLL_MS = 5_000;
/** Re-read this long after the next start or end, so the server's status has changed by then. */
const BOUNDARY_MARGIN_MS = 2_000;
/** setTimeout's longest delay; a later boundary just re-schedules after the early re-read. */
const MAX_TIMEOUT_MS = 2_147_483_647;

const BACK = (
  <Link to="/admin/contests" className="inline-flex items-center gap-1.5 hover:text-foreground">
    <ArrowLeft aria-hidden="true" className="size-3.5" />
    All contests
  </Link>
);

function EditorSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 w-full rounded-card" />
      <Skeleton className="h-32 w-full rounded-card" />
      <Skeleton className="h-56 w-full rounded-card" />
    </div>
  );
}

export function ExistingContest({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const contest = useQuery({
    queryKey: qk.admin.contests.detail(id),
    queryFn: ({ signal }) =>
      api.get(`/admin/contests/${id}`, { schema: AdminContestSchema, signal }),
    // Re-read while counted submissions are judged, so Apply ratings enables itself afterwards.
    refetchInterval: (q) => (q.state.data?.pendingSubmissions ? PENDING_POLL_MS : false),
  });

  // The status is computed by the server at fetch time: re-read at the next boundary (the end of a
  // running contest, the start of an upcoming one) so the badge and Apply ratings follow it. If
  // the server still reports the old status (clock skew), the new data schedules another try.
  const { refetch, dataUpdatedAt } = contest;
  const status = contest.data?.status;
  const boundary =
    status === 'RUNNING'
      ? contest.data?.endsAt
      : status === 'UPCOMING'
        ? contest.data?.startsAt
        : undefined;
  useEffect(() => {
    if (!boundary) return undefined;
    const delay = Math.max(Date.parse(boundary) - Date.now(), 0) + BOUNDARY_MARGIN_MS;
    const timer = setTimeout(() => void refetch(), Math.min(delay, MAX_TIMEOUT_MS));
    return () => clearTimeout(timer);
  }, [boundary, dataUpdatedAt, refetch]);

  const save = async (body: AdminContestBody) => {
    await api.put(`/admin/contests/${id}`, body);
    await queryClient.invalidateQueries({ queryKey: qk.admin.contests.detail(id) });
    void queryClient.invalidateQueries({ queryKey: qk.admin.contests.all });
    void queryClient.invalidateQueries({ queryKey: qk.contests.all });
    toast.success('Contest saved');
  };

  const data = contest.data;
  return (
    <Page
      title={data?.title ?? 'Edit contest'}
      documentTitle={data ? `Admin · ${data.title}` : 'Admin · Edit contest'}
      eyebrow={BACK}
      description={data ? undefined : 'Details, schedule, problems and ratings.'}
      actions={
        data ? (
          <>
            <Badge
              tone={
                data.status === 'RUNNING'
                  ? 'success'
                  : data.status === 'UPCOMING'
                    ? 'info'
                    : 'neutral'
              }
            >
              {data.status === 'RUNNING'
                ? 'Running'
                : data.status === 'UPCOMING'
                  ? 'Upcoming'
                  : 'Ended'}
            </Badge>
            <ButtonLink
              to={`/contests/${encodeURIComponent(data.slug)}`}
              variant="secondary"
              size="sm"
              rightIcon={<ExternalLink />}
            >
              Open contest
            </ButtonLink>
          </>
        ) : null
      }
    >
      <QueryState query={contest} loading={<EditorSkeleton />}>
        {(loaded) => (
          <div className="space-y-5">
            <ContestForm
              key={loaded.updatedAt}
              initial={contestToForm(loaded)}
              isNew={false}
              onSave={save}
              ratedLocked={loaded.ratedAt !== null}
            />
            <RatingsCard contest={loaded} />
            <PlagiarismRunCard contest={loaded} />
          </div>
        )}
      </QueryState>
    </Page>
  );
}

export function NewContest() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = async (body: AdminContestBody) => {
    const created = await api.post('/admin/contests', body, { schema: AdminContestSchema });
    void queryClient.invalidateQueries({ queryKey: qk.admin.contests.all });
    void queryClient.invalidateQueries({ queryKey: qk.contests.all });
    toast.success('Contest created');
    void navigate(`/admin/contests/${created.id}`, { replace: true });
  };
  return (
    <Page
      title="New contest"
      documentTitle="Admin · New contest"
      eyebrow={BACK}
      description="Pick the schedule and problems. Ratings and plagiarism checks unlock after the first save."
    >
      <ContestForm isNew onSave={create} />
    </Page>
  );
}
