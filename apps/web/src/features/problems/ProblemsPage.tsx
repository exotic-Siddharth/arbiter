// Placeholder from S5: lane A6 replaces this file with the problem list (spec 13.2).
// Keep the file path and the `Component` export (router.tsx lazy-loads it, R18).
import { DevPlaceholder } from '@/components/layout/DevPlaceholder';
import { Page } from '@/components/layout/Page';

export function Component() {
  return (
    <Page
      title="Problems"
      description="Original algorithmic problems. Filter by difficulty and tag, then open one to start solving."
    >
      <DevPlaceholder
        lane="A6"
        description="Search, difficulty, tag and status filters, sorting and a paginated table."
      />
    </Page>
  );
}

export default Component;
