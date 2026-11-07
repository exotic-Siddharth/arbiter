// Placeholder from S5: lane A7 replaces this file with admin user management (spec 13.2).
// Keep the file path and the `Component` export (router.tsx lazy-loads it, R18).
import { DevPlaceholder } from '@/components/layout/DevPlaceholder';
import { Page } from '@/components/layout/Page';

export function Component() {
  return (
    <Page title="Users" documentTitle="Admin · Users" description="Search users and change roles.">
      <DevPlaceholder lane="A7" />
    </Page>
  );
}

export default Component;
