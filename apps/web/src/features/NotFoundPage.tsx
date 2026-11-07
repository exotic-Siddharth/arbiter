// Placeholder from S5 (fully functional): lane A5 may restyle this 404 page. Keep the file path
// and the `Component` export (router.tsx lazy-loads it, R18).
import { SearchX } from 'lucide-react';
import { Page } from '@/components/layout/Page';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export function Component() {
  return (
    <Page title="Page not found" hideHeader>
      <EmptyState
        icon={<SearchX />}
        title="We couldn't find that page"
        description="The link may be broken, or the page may have moved."
        action={
          <>
            <ButtonLink to="/">Back to Arbiter</ButtonLink>
            <ButtonLink to="/problems" variant="secondary">
              Browse problems
            </ButtonLink>
          </>
        }
      />
    </Page>
  );
}

export default Component;
