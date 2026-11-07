import { CircleAlert, RefreshCw, SearchX } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message);
}

/** Route errorElement: 404s, failed lazy chunks (new deploy) and unexpected render errors. */
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const staleChunk = !notFound && isChunkLoadError(error);
  useDocumentTitle(notFound ? 'Page not found' : 'Something went wrong');

  if (!notFound && !staleChunk) console.error(error);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      {notFound ? (
        <EmptyState
          icon={<SearchX />}
          title="Page not found"
          description="The page you were looking for doesn't exist or has moved."
          action={<ButtonLink to="/">Back to Arbiter</ButtonLink>}
        />
      ) : (
        <EmptyState
          icon={<CircleAlert />}
          title={staleChunk ? 'Arbiter was updated' : 'Something went wrong'}
          description={
            staleChunk
              ? 'A newer version is available. Reload the page to continue.'
              : 'An unexpected error occurred while showing this page. Reloading usually fixes it.'
          }
          action={
            <>
              <Button leftIcon={<RefreshCw />} onClick={() => window.location.reload()}>
                Reload
              </Button>
              <ButtonLink to="/" variant="secondary">
                Go home
              </ButtonLink>
            </>
          }
        />
      )}
      {import.meta.env.DEV && !notFound && error instanceof Error ? (
        <pre className="mx-auto mt-6 max-w-3xl overflow-x-auto rounded-control border border-border bg-raised p-4 font-mono text-xs text-muted">
          {error.stack ?? error.message}
        </pre>
      ) : null}
    </div>
  );
}
