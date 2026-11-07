// Placeholder from S5: lane A7 replaces this file with the admin contest editor (spec 13.2).
// Keep the file path and the `Component` export (router.tsx lazy-loads it, R18).
import { useParams } from 'react-router';
import { DevPlaceholder } from '@/components/layout/DevPlaceholder';
import { Page } from '@/components/layout/Page';

export function Component() {
  const { id } = useParams();
  return (
    <Page
      title={id ? 'Edit contest' : 'New contest'}
      documentTitle={id ? 'Admin · Edit contest' : 'Admin · New contest'}
      description="Details, schedule, problems and ratings."
    >
      <DevPlaceholder lane="A7" />
    </Page>
  );
}

export default Component;
