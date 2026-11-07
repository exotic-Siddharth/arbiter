// Placeholder from S5: lane A6 replaces this file with the submissions list (spec 13.2).
// Keep the file path and the `Component` export (router.tsx lazy-loads it, R18).
import { DevPlaceholder } from '@/components/layout/DevPlaceholder';
import { Page } from '@/components/layout/Page';

export function Component() {
  return (
    <Page
      title="Submissions"
      description="Every judged submission, with live updates for the ones still running."
    >
      <DevPlaceholder
        lane="A6"
        description="Filters (mine/all, problem, verdict, language) and live-updating rows."
      />
    </Page>
  );
}

export default Component;
