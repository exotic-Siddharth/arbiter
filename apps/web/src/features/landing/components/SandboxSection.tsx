import { Card } from '@/components/ui/Card';

interface Layer {
  title: string;
  detail: string;
  flags: string;
}

/** The isolation layers of spec section 8, outermost first; numbers match the diagram markers. */
const LAYERS: readonly Layer[] = [
  {
    title: 'A throwaway container per job',
    detail:
      'Started fresh for every submission, with no network and removed when the verdict is in.',
    flags: '--rm --init --network none',
  },
  {
    title: 'A read-only world',
    detail:
      'The root filesystem cannot be written. Only small in-memory scratch disks (/work and /tmp) are available.',
    flags: '--read-only --tmpfs /work:128m --tmpfs /tmp:32m',
  },
  {
    title: 'Privileges dropped',
    detail:
      'All Linux capabilities are dropped except SETUID, SETGID and KILL, which the harness keeps to switch to an unprivileged user and to kill stray processes. The program itself runs with none, and cannot gain privileges.',
    flags:
      '--cap-drop ALL --cap-add SETUID --cap-add SETGID --cap-add KILL --security-opt no-new-privileges',
  },
  {
    title: 'Hard resource limits',
    detail:
      'Memory, one CPU, a process cap and a wall-clock deadline stop fork bombs and endless loops.',
    flags: '--memory --cpus 1 --pids-limit 128',
  },
  {
    title: 'Answers stay outside',
    detail: 'Expected outputs never enter the container. The worker compares output on the host.',
    flags: 'verdict = host-side check',
  },
];

function Marker({ n, x, y }: { n: number; x: number; y: number }) {
  return (
    <g aria-hidden="true">
      <circle cx={x} cy={y} r={9} className="fill-primary" />
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        className="fill-on-primary text-[11px] font-semibold"
      >
        {n}
      </text>
    </g>
  );
}

function Arrow({ x, y1, y2 }: { x: number; y1: number; y2: number }) {
  return (
    <g
      aria-hidden="true"
      className="stroke-muted"
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1={x} y1={y1} x2={x} y2={y2 - 4} />
      <polyline
        points={x - 4 + ',' + (y2 - 8) + ' ' + x + ',' + (y2 - 3) + ' ' + (x + 4) + ',' + (y2 - 8)}
      />
    </g>
  );
}

/** Nested boxes showing where untrusted code runs: host worker > container > harness > program. */
function SandboxDiagram() {
  return (
    <svg
      viewBox="0 0 340 424"
      role="img"
      aria-label="Sandbox isolation diagram: your code goes through the API and a queue to a judge worker on the host, which runs it inside a container, inside a harness, as an unprivileged process, and compares the output itself."
      className="mx-auto block h-auto w-full max-w-[420px]"
    >
      {/* Entry path */}
      <rect
        x={90}
        y={2}
        width={160}
        height={34}
        rx={8}
        className="fill-raised stroke-border-strong"
        strokeWidth={1}
      />
      <text x={170} y={24} textAnchor="middle" className="fill-foreground text-[12px] font-medium">
        Your source code
      </text>
      <Arrow x={170} y1={36} y2={58} />
      <rect
        x={90}
        y={58}
        width={160}
        height={34}
        rx={8}
        className="fill-raised stroke-border-strong"
        strokeWidth={1}
      />
      <text x={170} y={80} textAnchor="middle" className="fill-foreground text-[12px] font-medium">
        API and job queue
      </text>
      <Arrow x={170} y1={92} y2={114} />

      {/* Host worker */}
      <rect
        x={4}
        y={114}
        width={332}
        height={306}
        rx={12}
        className="fill-surface stroke-border-strong"
        strokeWidth={1.25}
      />
      <text x={20} y={136} className="fill-muted text-[11px] font-medium tracking-wide uppercase">
        Judge worker (host)
      </text>

      {/* Container */}
      <rect
        x={18}
        y={148}
        width={304}
        height={216}
        rx={10}
        className="fill-primary/5 stroke-primary"
        strokeWidth={1.5}
      />
      <text x={34} y={168} className="fill-primary-text text-[11px] font-semibold">
        Docker container
      </text>
      <text x={306} y={168} textAnchor="end" className="fill-muted font-mono text-[10px]">
        network: none
      </text>
      <Marker n={1} x={18} y={148} />

      {/* tmpfs chip */}
      <rect
        x={34}
        y={178}
        width={128}
        height={20}
        rx={6}
        className="fill-raised stroke-border"
        strokeWidth={1}
      />
      <text x={98} y={192} textAnchor="middle" className="fill-muted font-mono text-[10px]">
        /work tmpfs 128 MB
      </text>
      <rect
        x={168}
        y={178}
        width={138}
        height={20}
        rx={6}
        className="fill-raised stroke-border"
        strokeWidth={1}
      />
      <text x={237} y={192} textAnchor="middle" className="fill-muted font-mono text-[10px]">
        root fs read-only
      </text>
      <Marker n={2} x={322} y={188} />

      {/* Harness */}
      <rect
        x={34}
        y={208}
        width={272}
        height={140}
        rx={8}
        className="fill-accent/5 stroke-accent"
        strokeWidth={1.25}
      />
      <text x={48} y={228} className="fill-foreground text-[11px] font-semibold">
        Harness
      </text>
      <text x={292} y={228} textAnchor="end" className="fill-muted font-mono text-[10px]">
        caps dropped
      </text>
      <Marker n={3} x={34} y={208} />

      {/* Runner */}
      <rect
        x={50}
        y={240}
        width={240}
        height={92}
        rx={8}
        className="fill-warning/10 stroke-warning"
        strokeWidth={1.25}
      />
      <text x={64} y={260} className="fill-foreground text-[11px] font-semibold">
        Your program
      </text>
      <text x={64} y={278} className="fill-muted font-mono text-[10px]">
        uid 10001 (runner)
      </text>
      <text x={64} y={294} className="fill-muted font-mono text-[10px]">
        1 CPU · 128 pids · memory cap
      </text>
      <text x={64} y={310} className="fill-muted font-mono text-[10px]">
        wall-clock deadline
      </text>
      <Marker n={4} x={50} y={240} />

      {/* Host-side check */}
      <rect
        x={18}
        y={374}
        width={304}
        height={32}
        rx={8}
        className="fill-raised stroke-border"
        strokeWidth={1}
      />
      <text x={170} y={394} textAnchor="middle" className="fill-foreground text-[11px] font-medium">
        Expected outputs live here, outside the box
      </text>
      <Marker n={5} x={18} y={374} />
    </svg>
  );
}

/** "How the sandbox works": inline SVG diagram plus the isolation layers (spec section 8). */
export function SandboxSection() {
  return (
    <section aria-labelledby="sandbox-heading" className="border-t border-border bg-surface/40">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="max-w-2xl space-y-3">
          <p className="text-[13px] font-semibold tracking-wide text-primary-text uppercase">
            Safe by construction
          </p>
          <h2
            id="sandbox-heading"
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            How the sandbox works
          </h2>
          <p className="text-[15px] text-muted">
            Submitted code is untrusted. Each run is wrapped in five independent layers, so one
            failing does not break the others.
          </p>
        </div>
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
          <Card className="p-4 sm:p-6">
            <SandboxDiagram />
          </Card>
          <ol className="space-y-3">
            {LAYERS.map((layer, index) => (
              <li
                key={layer.title}
                className="flex gap-4 rounded-card border border-border bg-surface p-4"
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs font-semibold text-on-primary"
                >
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-1.5">
                  <h3 className="text-[15px] font-semibold text-foreground">{layer.title}</h3>
                  <p className="text-sm text-muted">{layer.detail}</p>
                  <code className="inline-block max-w-full rounded-md border border-border bg-raised px-2 py-0.5 font-mono text-xs break-words text-foreground">
                    {layer.flags}
                  </code>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
