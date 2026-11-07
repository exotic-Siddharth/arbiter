// Placeholder from S5: lane A6 replaces this file with submission detail (spec 13.2).
// Keep the file path and the `Component` export (router.tsx lazy-loads it, R18).
import { useParams } from 'react-router';
import { DevPlaceholder } from '@/components/layout/DevPlaceholder';
import { Page } from '@/components/layout/Page';

export function Component() {
  const { id = '' } = useParams();
  return (
    <Page title={`Submission ${id}`} description="Verdict, per-test results and source code.">
      <DevPlaceholder lane="A6" />
    </Page>
  );
}

export default Component;
