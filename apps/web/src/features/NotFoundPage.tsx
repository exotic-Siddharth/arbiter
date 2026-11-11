import { Compass } from 'lucide-react';
import { useLocation } from 'react-router';
import { Page } from '@/components/layout/Page';
import { ButtonLink } from '@/components/ui/Button';

export function Component() {
  const { pathname } = useLocation();
  return (
    <Page title="Page not found" hideHeader width="prose">
      <div className="flex flex-col items-center gap-4 px-2 py-12 text-center sm:py-20">
        <p
          aria-hidden="true"
          className="font-mono text-7xl font-semibold tracking-tighter text-primary-text sm:text-8xl"
        >
          404
        </p>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            We could not find that page
          </h2>
          <p className="mx-auto max-w-md text-[15px] text-muted">
            The link may be broken or the page may have moved. Nothing exists at{' '}
            <code className="rounded-md border border-border bg-raised px-1.5 py-0.5 font-mono text-[13px] break-all text-foreground">
              {pathname}
            </code>
            .
          </p>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <ButtonLink to="/">Back to Arbiter</ButtonLink>
          <ButtonLink to="/problems" variant="secondary" leftIcon={<Compass />}>
            Browse problems
          </ButtonLink>
        </div>
      </div>
    </Page>
  );
}

export default Component;
