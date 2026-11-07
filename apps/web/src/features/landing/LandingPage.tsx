// Placeholder from S5: lane A5 replaces this file with the landing page (spec 13.2: hero, live
// feed, stats, sandbox explainer, featured contest). Keep the file path and the `Component`
// export (router.tsx lazy-loads it, R18).
import { ArrowRight } from 'lucide-react';
import { DevPlaceholder } from '@/components/layout/DevPlaceholder';
import { Page } from '@/components/layout/Page';
import { ButtonLink } from '@/components/ui/Button';

export function Component() {
  return (
    <Page
      title="Write code. Get judged in a sandbox. Climb the board."
      documentTitle="Online judge"
      description="Solve original algorithmic problems in C++, Python, Java or JavaScript. Every submission runs in a locked-down Docker sandbox and its verdict streams back test by test."
      actions={
        <ButtonLink to="/problems" size="lg" rightIcon={<ArrowRight />}>
          Start solving
        </ButtonLink>
      }
    >
      <DevPlaceholder
        lane="A5"
        description="Live feed of judged submissions, stats, the sandbox explainer and the featured contest."
      />
    </Page>
  );
}

export default Component;
