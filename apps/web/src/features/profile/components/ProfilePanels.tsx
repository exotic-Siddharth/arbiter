import { DIFFICULTIES, getRatingTier, type Difficulty, type Profile } from '@arbiter/shared';
import { CheckCheck, Code2, Gauge, Medal } from 'lucide-react';
import { Link } from 'react-router';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { TimeAgo } from '@/components/TimeAgo';
import { tierColor } from '@/components/tier';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Stat } from '@/components/ui/Stat';
import { formatNumber, formatPercent, languageLabel } from '@/lib/format';

type Stats = Profile['stats'];

/** Rating, global rank, solved total and acceptance rate. */
export function StatCards({ profile }: { profile: Profile }) {
  const { user, stats } = profile;
  const available = stats.available.EASY + stats.available.MEDIUM + stats.available.HARD;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        label="Rating"
        icon={<Gauge />}
        value={<span style={{ color: tierColor(user.rating) }}>{formatNumber(user.rating)}</span>}
        hint={getRatingTier(user.rating).name}
      />
      <Stat
        label="Global rank"
        icon={<Medal />}
        value={stats.globalRank === null ? 'n/a' : '#' + formatNumber(stats.globalRank)}
        hint={stats.globalRank === null ? 'Not ranked yet' : 'by rating'}
      />
      <Stat
        label="Solved"
        icon={<CheckCheck />}
        value={formatNumber(stats.solved.total)}
        hint={'of ' + formatNumber(available) + ' problems'}
      />
      <Stat
        label="Acceptance"
        icon={<Code2 />}
        value={stats.submissions === 0 ? 'n/a' : formatPercent(stats.acceptanceRate, 0)}
        hint={
          formatNumber(stats.accepted) + ' of ' + formatNumber(stats.submissions) + ' submissions'
        }
      />
    </div>
  );
}

const ORDER: readonly Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

/** Solved / available per difficulty, in the difficulty colours. */
export function DifficultyBars({ stats }: { stats: Stats }) {
  return (
    <Card>
      <CardHeader title="Solved by difficulty" />
      <div className="space-y-4 p-5 pt-3">
        {ORDER.map((difficulty) => (
          <ProgressBar
            key={difficulty}
            showLabel
            size="md"
            label={DIFFICULTIES[difficulty].label}
            value={stats.solved[difficulty]}
            max={Math.max(1, stats.available[difficulty])}
            valueLabel={stats.solved[difficulty] + ' / ' + stats.available[difficulty]}
            valueText={stats.solved[difficulty] + ' of ' + stats.available[difficulty] + ' solved'}
            color={'var(--color-' + DIFFICULTIES[difficulty].token + ')'}
          />
        ))}
      </div>
    </Card>
  );
}

/** Submissions per language as a share of all submissions. */
export function LanguageBreakdown({ stats }: { stats: Stats }) {
  const languages = [...stats.languages].sort((a, b) => b.count - a.count);
  const total = languages.reduce((sum, item) => sum + item.count, 0);
  return (
    <Card>
      <CardHeader title="Languages" />
      <div className="p-5 pt-3">
        {languages.length === 0 ? (
          <EmptyState
            compact
            title="No submissions yet"
            description="Languages appear after the first submission."
          />
        ) : (
          <ul className="space-y-4">
            {languages.map((item) => (
              <li key={item.language}>
                <ProgressBar
                  showLabel
                  size="md"
                  label={languageLabel(item.language)}
                  value={item.count}
                  max={total}
                  valueLabel={
                    formatNumber(item.count) +
                    ' · ' +
                    formatPercent(total === 0 ? 0 : item.count / total, 0)
                  }
                  valueText={item.count + ' submissions'}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/** The latest accepted problems (at most 10). */
export function RecentAccepted({ items }: { items: Profile['recentAccepted'] }) {
  return (
    <Card>
      <CardHeader title="Recently accepted" />
      <div className="p-2 pt-1">
        {items.length === 0 ? (
          <EmptyState
            compact
            title="Nothing accepted yet"
            description="Accepted solutions will be listed here."
          />
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.problemSlug + item.at}>
                <Link
                  to={'/problems/' + encodeURIComponent(item.problemSlug)}
                  className="flex items-center gap-3 rounded-control px-3 py-2 transition-colors hover:bg-raised"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {item.title}
                  </span>
                  <DifficultyBadge difficulty={item.difficulty} size="sm" />
                  <TimeAgo date={item.at} className="w-24 shrink-0 text-right text-xs text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
