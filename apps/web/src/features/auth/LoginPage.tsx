// Placeholder from S5: lane A5 replaces this file with the login form (spec 13.2).
// Keep the file path and the `Component` export (router.tsx lazy-loads it, R18).
import { DevPlaceholder } from '@/components/layout/DevPlaceholder';
import { Page } from '@/components/layout/Page';

export function Component() {
  return (
    <Page
      title="Log in"
      description="Welcome back. Log in to submit solutions and join contests."
      width="narrow"
    >
      <DevPlaceholder lane="A5" description="Login form with inline validation and Try the demo." />
    </Page>
  );
}

export default Component;
