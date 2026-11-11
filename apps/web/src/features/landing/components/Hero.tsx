import { VERDICTS } from '@arbiter/shared';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { DemoButton } from '@/features/auth/components/DemoButton';
import { useAuth } from '@/stores/auth';

const SAMPLE_TESTS = 12;

/** Decorative sample of the live judging view (static, hidden from assistive technology). */
function JudgePreview() {
  return (
    <div
      aria-hidden="true"
      className="relative w-full max-w-md rounded-card border border-border bg-surface p-4 shadow-xl shadow-black/10 sm:p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-medium text-foreground">two_sum.cpp</p>
          <p className="text-xs text-muted">C++17 · sample run</p>
        </div>
        <Badge color={'var(--color-' + VERDICTS.AC.token + ')'} mono>
          <Check /> AC
        </Badge>
      </div>
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>Tests</span>
        <span className="font-mono tabular-nums">
          {SAMPLE_TESTS} / {SAMPLE_TESTS}
        </span>
      </div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {Array.from({ length: SAMPLE_TESTS }, (_, index) => (
          <span
            key={index}
            className="flex h-7 items-center justify-center rounded-md border border-verdict-ac/30 bg-verdict-ac/15 font-mono text-[11px] text-verdict-ac tabular-nums"
          >
            {index + 1}
          </span>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs">
        <div>
          <dt className="text-muted">Verdict</dt>
          <dd className="mt-0.5 font-medium text-foreground">Accepted</dd>
        </div>
        <div>
          <dt className="text-muted">Time</dt>
          <dd className="mt-0.5 font-mono font-medium text-foreground tabular-nums">48 ms</dd>
        </div>
        <div>
          <dt className="text-muted">Memory</dt>
          <dd className="mt-0.5 font-mono font-medium text-foreground tabular-nums">3.1 MB</dd>
        </div>
      </dl>
    </div>
  );
}

/** Landing hero: value proposition, calls to action and a sample verdict. */
export function Hero() {
  const signedIn = useAuth((state) => state.status === 'authenticated');
  const navigate = useNavigate();
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_28rem_at_75%_-10%,color-mix(in_srgb,var(--color-primary)_16%,transparent),transparent)]"
      />
      <div className="relative mx-auto grid max-w-7xl items-center grid-cols-[minmax(0,1fr)] gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14 lg:px-8 lg:py-20">
        <div className="space-y-6">
          <Badge
            tone="primary"
            pill
            icon={<ShieldCheck />}
            className="h-auto min-h-6 py-1 leading-snug whitespace-normal"
          >
            Every submission runs in a locked-down Docker sandbox
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]">
            Write code. Get judged in a sandbox.{' '}
            <span className="text-primary-text">Climb the board.</span>
          </h1>
          <p className="max-w-xl text-base text-pretty text-muted sm:text-lg">
            Solve original algorithmic problems, watch your verdict stream back test by test, and
            rise through the rating tiers in live ICPC-style contests.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink to="/problems" size="lg" rightIcon={<ArrowRight />}>
              Start solving
            </ButtonLink>
            {signedIn ? (
              <ButtonLink to="/contests" size="lg" variant="secondary">
                See contests
              </ButtonLink>
            ) : (
              <>
                <DemoButton size="lg" onSuccess={() => void navigate('/problems')} />
                <ButtonLink to="/register" size="lg" variant="ghost">
                  Create an account
                </ButtonLink>
              </>
            )}
          </div>
          <p className="text-[13px] text-muted">C++ · Python · Java · JavaScript</p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <JudgePreview />
        </div>
      </div>
    </section>
  );
}
