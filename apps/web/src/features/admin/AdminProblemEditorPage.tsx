// Placeholder from S5: lane A7 replaces this file with the admin problem editor (spec 13.2).
// Keep the file path and the `Component` export (router.tsx lazy-loads it, R18).
import { useParams } from 'react-router';
import { DevPlaceholder } from '@/components/layout/DevPlaceholder';
import { Page } from '@/components/layout/Page';

export function Component() {
  const { id } = useParams();
  return (
    <Page
      title={id ? 'Edit problem' : 'New problem'}
      documentTitle={id ? 'Admin · Edit problem' : 'Admin · New problem'}
      description="Details, tests and reference solution."
    >
      <DevPlaceholder lane="A7" />
    </Page>
  );
}

export default Component;
