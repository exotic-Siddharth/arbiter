// Placeholder from S5: lane A7 replaces this file with the judge monitor (spec 13.2).
// Keep the file path and the `Component` export (router.tsx lazy-loads it, R18).
import { DevPlaceholder } from '@/components/layout/DevPlaceholder';
import { Page } from '@/components/layout/Page';

export function Component() {
  return (
    <Page
      title="Judge monitor"
      documentTitle="Admin · Judge monitor"
      description="Queue depth, workers and verdict latency, refreshed every 5 seconds."
    >
      <DevPlaceholder lane="A7" />
    </Page>
  );
}

export default Component;
