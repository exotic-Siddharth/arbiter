// Placeholder from S5: lane A6 replaces this file with the problem workspace for /problems/:slug and /contests/:slug/problems/:label (spec 13.2).
// Keep the file path and the `Component` export (router.tsx lazy-loads it, R18).
import { useParams } from 'react-router';
import { DevPlaceholder } from '@/components/layout/DevPlaceholder';
import { Page } from '@/components/layout/Page';

export function Component() {
  const { slug = '', label } = useParams();
  const contestMode = label !== undefined;
  return (
    <Page
      title={contestMode ? `Problem ${label}` : slug}
      eyebrow={contestMode ? `Contest · ${slug}` : 'Problem'}
      description="Statement, editor, custom runs and live verdicts."
    >
      <DevPlaceholder
        lane="A6"
        description="Resizable statement and editor workspace with Run and Submit."
      />
    </Page>
  );
}

export default Component;
