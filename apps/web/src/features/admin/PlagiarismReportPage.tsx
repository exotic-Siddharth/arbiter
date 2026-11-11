import { PlagiarismReportDetailSchema } from '@arbiter/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Page } from '@/components/layout/Page';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  QueryState,
  Skeleton,
} from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime, formatPercent, pluralize } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { PairsTable } from './components/PairsTable';
import { SideBySideCode } from './components/SideBySideCode';
import { REPORT_STATUS } from './lib/reportStatus';

/** /admin/plagiarism/:id: pairs sorted by similarity, then the chosen pair side by side. */
export function Component() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const report = useQuery({
    queryKey: qk.admin.plagiarism.detail(id),
    queryFn: ({ signal }) =>
      api.get(`/admin/plagiarism/${encodeURIComponent(id)}`, {
        schema: PlagiarismReportDetailSchema,
        signal,
      }),
    refetchInterval: (q) =>
      q.state.data && (q.state.data.status === 'PENDING' || q.state.data.status === 'RUNNING')
        ? 2000
        : false,
  });

  const data = report.data;
  const sorted = data ? [...data.pairs].sort((a, b) => b.similarity - a.similarity) : [];
  const requested = params.get('pair');
  const selected = sorted.find((pair) => pair.id === requested) ?? sorted[0];

  return (
    <Page
      title={data?.contestTitle ? `Report: ${data.contestTitle}` : 'Plagiarism report'}
      documentTitle={
        data?.contestTitle ? `Admin · Report ${data.contestTitle}` : `Admin · Report ${id}`
      }
      eyebrow={
        <Link
          to="/admin/plagiarism"
          className="inline-flex items-center gap-1.5 hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          All reports
        </Link>
      }
      description={data ? undefined : 'Similar pairs, side by side.'}
      actions={
        data ? (
          <Badge
            tone={REPORT_STATUS[data.status].tone}
            dot={data.status === 'PENDING' || data.status === 'RUNNING' ? 'pulse' : false}
          >
            {REPORT_STATUS[data.status].label}
          </Badge>
        ) : null
      }
    >
      <QueryState
        query={report}
        loading={
          <div className="space-y-4">
            <Skeleton className="h-16 w-full rounded-card" />
            <Skeleton className="h-64 w-full rounded-card" />
          </div>
        }
      >
        {(loaded) => (
          <div className="space-y-5">
            <p className="text-sm text-muted">
              Threshold{' '}
              <span className="font-mono text-foreground">
                {Math.round(loaded.threshold * 100)}%
              </span>
              {' · '}
              {loaded.problemId ? 'one problem' : 'all problems'}
              {' · '}
              started {formatDateTime(loaded.createdAt)}
              {loaded.finishedAt ? <> and finished {formatDateTime(loaded.finishedAt)}</> : null}
            </p>

            {loaded.status === 'FAILED' ? (
              <Alert tone="danger" title="The check failed">
                {loaded.error ??
                  'The job stopped before it finished. Run it again from the contest page.'}
              </Alert>
            ) : null}
            {loaded.status === 'PENDING' || loaded.status === 'RUNNING' ? (
              <Alert tone="info" title="Comparing submissions">
                This page updates by itself when the report is ready.
              </Alert>
            ) : null}

            {loaded.status === 'DONE' && sorted.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<CircleCheck />}
                  title="No pair reached the threshold"
                  description={`No two solutions are ${Math.round(loaded.threshold * 100)}% similar or more. Lower the threshold to see weaker matches.`}
                />
              </Card>
            ) : null}

            {sorted.length > 0 ? (
              <>
                <Card className="overflow-hidden">
                  <CardHeader
                    title={`${pluralize(sorted.length, 'similar pair')}`}
                    description="Highest similarity first. Similarity is shared fingerprints over the shorter program."
                    divider
                  />
                  <div className="max-h-[22rem] overflow-y-auto scrollbar-thin">
                    <PairsTable
                      pairs={sorted}
                      selectedId={selected?.id ?? ''}
                      onSelect={(pairId) => {
                        const next = new URLSearchParams(params);
                        next.set('pair', pairId);
                        setParams(next, { replace: true });
                      }}
                    />
                  </div>
                </Card>
                {selected ? (
                  <Card>
                    <CardHeader
                      title={`${selected.a.username} vs ${selected.b.username}`}
                      description={`${selected.problemTitle} · ${formatPercent(selected.similarity, 0)} similar. Highlighted lines belong to matched fingerprints.`}
                      divider
                    />
                    <CardContent>
                      <SideBySideCode a={selected.a} b={selected.b} />
                    </CardContent>
                  </Card>
                ) : null}
              </>
            ) : null}
          </div>
        )}
      </QueryState>
    </Page>
  );
}

export default Component;
