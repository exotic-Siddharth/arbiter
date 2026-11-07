// Placeholder from S5: lane A5 replaces this file with the registration form (spec 13.2).
// Keep the file path and the `Component` export (router.tsx lazy-loads it, R18).
import { DevPlaceholder } from '@/components/layout/DevPlaceholder';
import { Page } from '@/components/layout/Page';

export function Component() {
  return (
    <Page
      title="Create your account"
      documentTitle="Sign up"
      description="Solve problems, climb the rating ladder and compete in live contests."
      width="narrow"
    >
      <DevPlaceholder lane="A5" description="Registration form with inline validation." />
    </Page>
  );
}

export default Component;
