import {
  CreatePlagiarismBody,
  PlagiarismCreatedResponseSchema,
  RateContestResponseSchema,
  type AdminContest,
  type RateContestResponse,
} from '@arbiter/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ScanSearch, Scale } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { RatingBadge } from '@/components';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  ConfirmDialog,
  Input,
  Select,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import { api, getErrorMessage, isApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber, pluralize } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { toast, toastError } from '@/lib/toast';

function Delta({ value }: { value: number }) {
  const label = value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0';
  return (
    <span
      className={cn(
        'font-mono font-medium tabular-nums',
        value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-muted',
      )}
    >
      {label}
      <span className="sr-only">
        {value > 0 ? ' (gain)' : value < 0 ? ' (loss)' : ' (no change)'}
      </span>
    </span>
  );
}

export function RatingChanges({ changes }: { changes: RateContestResponse['changes'] }) {
  return (
    <div className="overflow-hidden rounded-control border border-border">
      <Table aria-label="Rating changes">
        <THead>
          <Tr>
            <Th numeric className="w-16">
              Rank
            </Th>
            <Th>User</Th>
            <Th numeric>Before</Th>
            <Th numeric>After</Th>
            <Th numeric>Change</Th>
          </Tr>
        </THead>
        <TBody>
          {changes.map((change) => (
            <Tr key={change.username}>
              <Td numeric muted>
                {change.rank}
              </Td>
              <Td>
                <Link
                  to={`/u/${encodeURIComponent(change.username)}`}
                  className="font-medium hover:underline"
                >
                  {change.username}
                </Link>
              </Td>
              <Td numeric>{formatNumber(change.oldRating)}</Td>
              <Td numeric>
                <RatingBadge rating={change.newRating} showTier={false} variant="text" size="sm" />
              </Td>
              <Td numeric>
                <Delta value={change.newRating - change.oldRating} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

/** Apply ratings: confirm first, then show the changes the server computed. */
export function RatingsCard({ contest }: { contest: AdminContest }) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<RateContestResponse | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const rate = useMutation({
    mutationFn: () =>
      api.post(`/admin/contests/${contest.id}/rate`, undefined, {
        schema: RateContestResponseSchema,
      }),
    onSuccess: (data) => {
      setResult(data);
      setConflict(null);
      toast.success(`Ratings applied to ${pluralize(data.changes.length, 'participant')}`);
      void queryClient.invalidateQueries({ queryKey: qk.admin.contests.all });
      void queryClient.invalidateQueries({ queryKey: qk.contests.all });
      void queryClient.invalidateQueries({ queryKey: qk.leaderboard() });
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        setConflict(getErrorMessage(error));
        void queryClient.invalidateQueries({ queryKey: qk.admin.contests.detail(contest.id) });
      } else {
        toastError(error, 'Could not apply ratings');
      }
    },
  });

  const rated = contest.ratedAt !== null || result !== null;
  const notEnded = contest.status !== 'ENDED';
  const judging = contest.pendingSubmissions;

  return (
    <Card>
      <CardHeader
        title="Ratings"
        description="Pairwise Elo from the final standings. It can be applied once, after the contest ends."
        divider
        actions={
          <Button
            size="sm"
            leftIcon={<Scale />}
            disabled={rated || notEnded || judging > 0}
            onClick={() => setConfirmOpen(true)}
          >
            Apply ratings
          </Button>
        }
      />
      <CardContent className="space-y-3">
        {rated ? (
          <Alert tone="success" title="Ratings applied">
            {contest.ratedAt
              ? `Applied on ${formatDateTime(contest.ratedAt)}.`
              : 'Applied just now.'}{' '}
            Rating changes appear on profiles and the leaderboard.
          </Alert>
        ) : notEnded ? (
          <p className="text-sm text-muted">
            Available after the contest ends (
            {contest.status === 'RUNNING' ? 'it is running now' : 'it has not started'}).
          </p>
        ) : judging > 0 ? (
          <p className="text-sm text-muted">
            {pluralize(judging, 'submission')} {judging === 1 ? 'is' : 'are'} still being judged.
            Ratings can be applied once every counted submission has a verdict.
          </p>
        ) : (
          <p className="text-sm text-muted">
            {pluralize(contest.participantCount, 'participant')} registered. Only registrants with a
            counted submission are rated.
          </p>
        )}
        {conflict ? (
          <Alert tone="warning" title="Ratings were not applied">
            {conflict}
          </Alert>
        ) : null}
        {result ? (
          result.changes.length > 0 ? (
            <RatingChanges changes={result.changes} />
          ) : (
            <p className="text-sm text-muted">
              Nobody was rated: no registrant made a counted submission.
            </p>
          )
        ) : null}
      </CardContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Apply ratings?"
        description={`This changes the rating of every participant of ${contest.title} and cannot be undone or repeated.`}
        confirmLabel="Apply ratings"
        onConfirm={async () => {
          await rate.mutateAsync();
        }}
      />
    </Card>
  );
}

/** Run plagiarism check: threshold, optional single problem; the report page shows the pairs. */
export function PlagiarismRunCard({ contest }: { contest: AdminContest }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [threshold, setThreshold] = useState('0.6');
  const [problemId, setProblemId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: (body: CreatePlagiarismBody) =>
      api.post('/admin/plagiarism', body, { schema: PlagiarismCreatedResponseSchema }),
    onSuccess: (result) => {
      toast.success('Plagiarism check started');
      void queryClient.invalidateQueries({ queryKey: qk.admin.plagiarism.all });
      void navigate(`/admin/plagiarism/${result.reportId}`);
    },
    onError: (err) => toastError(err, 'Could not start the check'),
  });

  const submit = () => {
    const parsed = CreatePlagiarismBody.safeParse({
      contestId: contest.id,
      problemId: problemId || undefined,
      threshold: threshold.trim() === '' ? Number.NaN : Number(threshold),
    });
    if (!parsed.success) {
      setError('Enter a threshold between 0 and 1, e.g. 0.6');
      return;
    }
    setError(null);
    run.mutate(parsed.data);
  };

  return (
    <Card>
      <CardHeader
        title="Plagiarism check"
        description="Compares each participant's latest accepted submission per problem (winnowing, as in MOSS)."
        divider
      />
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-start"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Select
            label="Problem"
            value={problemId}
            onChange={(event) => setProblemId(event.target.value)}
            placeholder="All problems"
            options={contest.problems.map((problem) => ({
              value: problem.problemId,
              label: `${problem.label}. ${problem.title}`,
            }))}
          />
          <Input
            label="Threshold"
            inputMode="decimal"
            className="font-mono"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            error={error ?? undefined}
            hint={error ? undefined : '0 to 1; pairs at or above are kept'}
          />
          <Button
            type="submit"
            className="sm:mt-[1.625rem]"
            leftIcon={<ScanSearch />}
            loading={run.isPending}
          >
            Run check
          </Button>
        </form>
        {contest.problems.length === 0 ? (
          <p className="mt-3 text-sm text-muted">This contest has no problems yet.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
