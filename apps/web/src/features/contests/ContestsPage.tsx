// Placeholder from S5: lane A7 replaces this file with the contest list (spec 13.2).
// Keep the file path and the `Component` export (router.tsx lazy-loads it, R18).
import { DevPlaceholder } from '@/components/layout/DevPlaceholder';
import { Page } from '@/components/layout/Page';

export function Component() {
  return (
    <Page title="Contests" description="Live ICPC-style rounds with real-time scoreboards.">
      <DevPlaceholder
        lane="A7"
        description="Running, upcoming and past contests with countdowns and registration."
      />
    </Page>
  );
}

export default Component;
