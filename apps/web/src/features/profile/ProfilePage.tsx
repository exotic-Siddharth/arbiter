// Placeholder from S5: lane A5 replaces this file with the user profile (spec 13.2).
// Keep the file path and the `Component` export (router.tsx lazy-loads it, R18).
import { useParams } from 'react-router';
import { DevPlaceholder } from '@/components/layout/DevPlaceholder';
import { Page } from '@/components/layout/Page';

export function Component() {
  const { username = '' } = useParams();
  return (
    <Page
      title={username}
      eyebrow="Profile"
      description="Solved problems, activity heatmap and rating history."
    >
      <DevPlaceholder lane="A5" />
    </Page>
  );
}

export default Component;
