import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { FeaturedContest } from './components/FeaturedContest';
import { Hero } from './components/Hero';
import { LiveFeed } from './components/LiveFeed';
import { SandboxSection } from './components/SandboxSection';
import { StatsStrip } from './components/StatsStrip';

export function Component() {
  useDocumentTitle('Online judge');
  return (
    <div className="w-full">
      <Hero />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <StatsStrip />
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <LiveFeed />
          <FeaturedContest />
        </div>
      </div>
      <SandboxSection />
    </div>
  );
}

export default Component;
