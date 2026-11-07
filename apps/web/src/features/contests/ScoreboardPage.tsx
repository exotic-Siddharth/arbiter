// Placeholder from S5: lane A7 replaces this file with the live ICPC scoreboard (spec 13.2).
// Keep the file path and the `Component` export (router.tsx lazy-loads it, R18).
import { useParams } from 'react-router';
import { DevPlaceholder } from '@/components/layout/DevPlaceholder';
import { Page } from '@/components/layout/Page';

export function Component() {
  const { slug = '' } = useParams();
  return (
    <Page title="Scoreboard" eyebrow={`Contest · ${slug}`} description="Live ICPC standings.">
      <DevPlaceholder lane="A7" />
    </Page>
  );
}

export default Component;
