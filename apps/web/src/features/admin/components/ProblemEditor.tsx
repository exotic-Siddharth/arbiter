import { AdminProblemSchema, type AdminProblem, type AdminProblemBody } from '@arbiter/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Page } from '@/components/layout/Page';
import {
  Alert,
  Badge,
  ButtonLink,
  QueryState,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { api } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { toast } from '@/lib/toast';
import { ProblemDetailsForm } from './ProblemDetailsForm';
import { ProblemReferenceTab } from './ProblemReferenceTab';
import { ProblemTestsTab } from './ProblemTestsTab';
import { problemReference, problemToForm } from '../lib/problemForm';

type Tab = 'details' | 'tests' | 'reference';

function isTab(value: string | null): value is Tab {
  return value === 'details' || value === 'tests' || value === 'reference';
}

const BACK = (
  <Link to="/admin/problems" className="inline-flex items-center gap-1.5 hover:text-foreground">
    <ArrowLeft aria-hidden="true" className="size-3.5" />
    All problems
  </Link>
);

function EditorSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-64 w-full rounded-card" />
      <Skeleton className="h-48 w-full rounded-card" />
    </div>
  );
}

export function ExistingProblem({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = isTab(requested) ? requested : 'details';

  const problem = useQuery({
    queryKey: qk.admin.problems.detail(id),
    queryFn: ({ signal }) =>
      api.get(`/admin/problems/${id}`, { schema: AdminProblemSchema, signal }),
  });

  const save = async (body: AdminProblemBody) => {
    await api.put(`/admin/problems/${id}`, body);
    await queryClient.invalidateQueries({ queryKey: qk.admin.problems.detail(id) });
    void queryClient.invalidateQueries({ queryKey: qk.admin.problems.all });
    toast.success('Problem saved');
  };

  return (
    <Page
      title={problem.data?.title ?? 'Edit problem'}
      documentTitle={problem.data ? `Admin · ${problem.data.title}` : 'Admin · Edit problem'}
      eyebrow={BACK}
      description={problem.data ? undefined : 'Details, tests and reference solution.'}
      actions={
        problem.data ? (
          <>
            <Badge tone={problem.data.isPublished ? 'success' : 'neutral'}>
              {problem.data.isPublished ? 'Published' : 'Draft'}
            </Badge>
            {problem.data.isPublished ? (
              <ButtonLink
                to={`/problems/${problem.data.slug}`}
                variant="secondary"
                size="sm"
                rightIcon={<ExternalLink />}
              >
                View
              </ButtonLink>
            ) : null}
          </>
        ) : null
      }
    >
      <QueryState query={problem} loading={<EditorSkeleton />}>
        {(data: AdminProblem) => (
          <Tabs
            value={tab}
            onValueChange={(value) => {
              const next = new URLSearchParams(params);
              if (value === 'details') next.delete('tab');
              else next.set('tab', value);
              setParams(next, { replace: true });
            }}
          >
            <TabsList aria-label="Problem sections">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="tests" count={data.testCount}>
                Tests
              </TabsTrigger>
              <TabsTrigger value="reference">Reference</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="pt-5">
              {data.testCount === 0 && !data.isPublished ? (
                <Alert tone="info" className="mb-5" title="Next step: add tests">
                  A problem needs tests (at least the samples) before it can be judged. Use the
                  Tests tab, then validate the reference solution.
                </Alert>
              ) : null}
              {data.testCount > 0 ? (
                <p className="mb-4 text-sm text-muted">
                  {formatNumber(data.testCount)} tests ({formatNumber(data.sampleCount)} samples),{' '}
                  {formatNumber(data.acceptedCount)} of {formatNumber(data.submissionCount)}{' '}
                  submissions accepted.
                </p>
              ) : null}
              {/* Remount after a save so the form re-reads the server's normalised values. */}
              <ProblemDetailsForm
                key={data.updatedAt}
                initial={problemToForm(data)}
                reference={problemReference(data)}
                isNew={false}
                onSave={save}
              />
            </TabsContent>
            <TabsContent value="tests" className="pt-5">
              <ProblemTestsTab problemId={data.id} />
            </TabsContent>
            <TabsContent value="reference" className="pt-5">
              <ProblemReferenceTab key={data.updatedAt} problem={data} />
            </TabsContent>
          </Tabs>
        )}
      </QueryState>
    </Page>
  );
}

export function NewProblem() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const create = async (body: AdminProblemBody) => {
    const created = await api.post('/admin/problems', body, { schema: AdminProblemSchema });
    void queryClient.invalidateQueries({ queryKey: qk.admin.problems.all });
    toast.success('Problem created. Add its tests next.');
    void navigate(`/admin/problems/${created.id}?tab=tests`, { replace: true });
  };

  return (
    <Page
      title="New problem"
      documentTitle="Admin · New problem"
      eyebrow={BACK}
      description="Start with the details. Tests and the reference solution unlock after the first save."
    >
      <ProblemDetailsForm reference={problemReference(undefined)} isNew onSave={create} />
    </Page>
  );
}
