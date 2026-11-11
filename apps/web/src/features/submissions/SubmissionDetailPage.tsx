import { LANGUAGES } from '@arbiter/shared';
import { ArrowLeft, Code2, Lock, Trophy } from 'lucide-react';
import { useParams } from 'react-router';
import { UserLink, VerdictBadge } from '@/components';
import { CodeEditor } from '@/components/CodeEditor';
import { Page } from '@/components/layout/Page';
import {
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CopyButton,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { isApiError } from '@/lib/api';
import { formatDateTime, formatMemoryKb, formatMs, languageLabel } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { CodeBlock } from '@/features/problems/components/CodeBlock';
import { ResultPanel } from '@/features/problems/components/ResultPanel';
import { useSubmissionProgress } from '@/features/problems/hooks/useSubmissionProgress';
import { DetailSkeleton, Fact } from './components/DetailParts';
import { TestResultsTable } from './components/TestResultsTable';

/** /submissions/:id: summary, live result, per-test table and the source (owner or admin). */
export function Component() {
  const { id = '' } = useParams();
  const { progress, detail, query } = useSubmissionProgress(id || null);
  useDocumentTitle(detail ? `Submission · ${detail.problem.title}` : 'Submission');

  if (query.isPending) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <DetailSkeleton />
      </div>
    );
  }

  if (!detail || !progress) {
    const notFound = isApiError(query.error) && query.error.status === 404;
    return (
      <Page title="Submission" hideHeader>
        <Card>
          <ErrorState
            error={query.error}
            title={notFound ? 'Submission not found' : undefined}
            onRetry={notFound ? undefined : () => void query.refetch()}
            retrying={query.isFetching}
          />
        </Card>
        <ButtonLink to="/submissions" variant="ghost" size="sm" leftIcon={<ArrowLeft />}>
          All submissions
        </ButtonLink>
      </Page>
    );
  }

  const language = LANGUAGES[detail.language];
  const showCompilerMessages =
    detail.verdict !== 'CE' && detail.compileOutput !== null && detail.compileOutput.trim() !== '';

  return (
    <Page
      title={detail.problem.title}
      documentTitle={`Submission · ${detail.problem.title}`}
      eyebrow={
        <span className="inline-flex items-center gap-2">
          Submission
          <span className="font-mono text-xs text-muted/80">{detail.id}</span>
        </span>
      }
      actions={
        <>
          {detail.contestSlug ? (
            <ButtonLink
              to={`/contests/${encodeURIComponent(detail.contestSlug)}`}
              variant="ghost"
              size="sm"
              leftIcon={<Trophy />}
            >
              Contest
            </ButtonLink>
          ) : null}
          <ButtonLink
            to={`/problems/${encodeURIComponent(detail.problem.slug)}`}
            variant="secondary"
            size="sm"
            leftIcon={<Code2 />}
          >
            Open problem
          </ButtonLink>
        </>
      }
    >
      <Card>
        <CardContent className="py-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
            <Fact label="Verdict">
              <VerdictBadge
                verdict={progress.verdict}
                status={progress.status}
                testsDone={progress.testsDone}
                testsTotal={progress.testsTotal}
              />
            </Fact>
            <Fact label="Author">
              <UserLink username={detail.user.username} />
            </Fact>
            <Fact label="Language">{languageLabel(detail.language)}</Fact>
            <Fact label="Time">
              <span className="font-mono tabular-nums">{formatMs(progress.timeMs)}</span>
            </Fact>
            <Fact label="Memory">
              <span className="font-mono tabular-nums">{formatMemoryKb(progress.memoryKb)}</span>
            </Fact>
            <Fact label="Submitted">
              <time dateTime={detail.createdAt} className="tabular-nums">
                {formatDateTime(detail.createdAt)}
              </time>
            </Fact>
            <Fact label="Judged">
              {detail.judgedAt ? (
                <time dateTime={detail.judgedAt} className="tabular-nums">
                  {formatDateTime(detail.judgedAt)}
                </time>
              ) : (
                <span className="text-muted">—</span>
              )}
            </Fact>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Result" divider />
        <CardContent>
          <ResultPanel progress={progress} detail={detail} showDetailsLink={false} />
        </CardContent>
      </Card>

      {detail.results.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader
            title="Test results"
            description={`${progress.testsPassed} of ${progress.testsTotal} tests passed. Hidden tests show only their verdict and resources.`}
            divider
          />
          <TestResultsTable results={detail.results} />
        </Card>
      ) : null}

      {showCompilerMessages ? (
        <Card>
          <CardHeader title="Compiler messages" divider />
          <CardContent>
            <CodeBlock text={detail.compileOutput ?? ''} maxHeightClassName="max-h-60" />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Source code"
          description={detail.sourceCode !== null ? language.fileName : undefined}
          actions={
            detail.sourceCode ? (
              <CopyButton
                text={detail.sourceCode}
                label="Copy source code"
                variant="secondary"
                size="sm"
              >
                Copy
              </CopyButton>
            ) : undefined
          }
          divider
        />
        {detail.sourceCode !== null ? (
          <div className="p-2">
            <CodeEditor
              language={detail.language}
              value={detail.sourceCode}
              readOnly
              height={Math.min(560, Math.max(220, detail.sourceCode.split('\n').length * 22 + 32))}
              path={`submission/${detail.id}/${language.fileName}`}
              ariaLabel={`Source code (${language.label}, read-only)`}
              className="border-0"
            />
          </div>
        ) : (
          <EmptyState
            compact
            icon={<Lock />}
            title="Source code hidden"
            description="Source code is visible only to its author and admins."
          />
        )}
      </Card>
    </Page>
  );
}

export default Component;
