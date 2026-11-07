// Development-only UI kit gallery at /dev/kit (router.tsx registers it only when
// import.meta.env.DEV). A visual reference for the lanes and for screenshot checks.
import { LANGUAGES, VERDICT_IDS, type Language } from '@arbiter/shared';
import { BookOpen, Inbox, Pencil, Play, Plus, Search, Send, Trash2, Trophy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CodeEditor } from '@/components/CodeEditor';
import { Countdown } from '@/components/Countdown';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { Page } from '@/components/layout/Page';
import { Markdown } from '@/components/Markdown';
import { RatingBadge } from '@/components/RatingBadge';
import { UserLink } from '@/components/UserLink';
import { VerdictBadge } from '@/components/VerdictBadge';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  CopyButton,
  Dialog,
  DropdownMenu,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  MenuItem,
  MenuSeparator,
  Pagination,
  ProgressBar,
  Select,
  Shortcut,
  Skeleton,
  SkeletonText,
  Spinner,
  Stat,
  Switch,
  TBody,
  THead,
  Table,
  TableSkeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Td,
  Textarea,
  Th,
  Tooltip,
  Tr,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';

export function KitSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} divider />
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

const SAMPLE_MD = `Given $n$ integers $a_1, \\dots, a_n$, print the length of the longest strictly
increasing subsequence.

## Input

The first line contains $n$ $(1 \\le n \\le 2 \\cdot 10^5)$.

| n | answer |
|---|---|
| 5 | 3 |

$$
\\text{LIS}(a) = \\max_i \\, dp_i
$$

Use \`std::lower_bound\` for an $O(n \\log n)$ solution.`;

const ROWS = [
  { title: 'Lantern Relay', difficulty: 'EASY', acceptance: '71.4%', submissions: 812 },
  { title: 'Orchard Partition', difficulty: 'MEDIUM', acceptance: '43.0%', submissions: 377 },
  { title: 'Signal Towers', difficulty: 'HARD', acceptance: '18.9%', submissions: 129 },
] as const;

export function Component() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [published, setPublished] = useState(true);
  const [page, setPage] = useState(3);
  const [sort, setSort] = useState<'asc' | 'desc'>('asc');
  const [language, setLanguage] = useState<Language>('CPP');
  const [code, setCode] = useState(LANGUAGES.CPP.template);
  const in90Minutes = new Date(Date.now() + 90 * 60_000).toISOString();

  return (
    <Page title="UI kit" description="Every shared component in the current theme (development only).">
      <div className="grid gap-6 lg:grid-cols-2">
        <KitSection title="Buttons">
          <div className="flex flex-wrap items-center gap-2">
            <Button leftIcon={<Send />}>Submit</Button>
            <Button variant="secondary" leftIcon={<Play />}>
              Run
            </Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger" leftIcon={<Trash2 />}>
              Delete
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="xs">Extra small</Button>
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
            <IconButton label="Edit" icon={<Pencil />} variant="secondary" />
            <CopyButton text="1 2 3" label="Copy input" />
          </div>
        </KitSection>

        <KitSection title="Badges">
          <div className="flex flex-wrap gap-2">
            {VERDICT_IDS.map((verdict) => (
              <VerdictBadge key={verdict} verdict={verdict} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {VERDICT_IDS.map((verdict) => (
              <VerdictBadge key={verdict} verdict={verdict} variant="short" size="sm" />
            ))}
            <VerdictBadge verdict={null} status="QUEUED" />
            <VerdictBadge verdict={null} status="RUNNING" testsDone={3} testsTotal={12} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DifficultyBadge difficulty="EASY" />
            <DifficultyBadge difficulty="MEDIUM" />
            <DifficultyBadge difficulty="HARD" />
            <Badge tone="primary">primary</Badge>
            <Badge tone="accent" dot>
              accent
            </Badge>
            <Badge>neutral</Badge>
            <Badge tone="success" variant="outline">
              outline
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[1100, 1250, 1450, 1700, 2000, 2300].map((rating) => (
              <RatingBadge key={rating} rating={rating} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <UserLink username="ada_lovelace" rating={2310} showAvatar />
            <UserLink username="grace" rating={1650} showAvatar />
            <Avatar name="demo" size="lg" />
          </div>
        </KitSection>

        <KitSection title="Form controls">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Username" placeholder="ada_lovelace" hint="3–20 letters, digits or _." />
            <Input label="Email" defaultValue="ada@" error="Enter a valid email" />
            <Input aria-label="Search problems" placeholder="Search problems…" leftIcon={<Search />} />
            <Select
              label="Language"
              value={language}
              onChange={(event) => {
                const next = event.target.value as Language;
                setLanguage(next);
                setCode(LANGUAGES[next].template);
              }}
              options={Object.values(LANGUAGES).map((info) => ({ value: info.id, label: info.label }))}
            />
            <Input label="Disabled" disabled defaultValue="read only" />
            <Select label="Difficulty" placeholder="All difficulties" options={[{ value: 'EASY', label: 'Easy' }]} />
          </div>
          <Textarea label="Custom input" mono defaultValue={'5\n1 2 3 4 5'} />
          <div className="flex flex-wrap items-start gap-6">
            <Switch checked={published} onCheckedChange={setPublished} label="Published" description="Visible in /problems." />
            <Checkbox label="Replace existing tests" description="Delete current tests first." />
          </div>
        </KitSection>

        <KitSection title="Feedback">
          <Alert tone="danger" title="Judge unavailable">
            The sandbox could not start. Your submission will be marked as an internal error.
          </Alert>
          <Alert tone="info" title="Contest starts soon">
            Registration stays open until the contest ends.
          </Alert>
          <ProgressBar label="Tests passed" value={7} max={12} showLabel color="var(--color-verdict-ac)" />
          <ProgressBar label="Generating outputs" />
          <div className="flex items-center gap-4">
            <Spinner label="Loading" />
            <Countdown to={in90Minutes} label="until the start" className="text-lg" />
            <Tooltip content="Ctrl+Enter submits">
              <Button variant="secondary" size="sm">
                Hover me
              </Button>
            </Tooltip>
            <Shortcut keys="Mod+Enter" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => toast.success('Submission queued')}>
              Success toast
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast.error('Slow down', { description: 'Too many submissions. Try again in 37 s.' })
              }
            >
              Error toast
            </Button>
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>
              Dialog
            </Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Confirm
            </Button>
            <DropdownMenu trigger="Actions" triggerVariant="secondary" triggerSize="md">
              <MenuItem icon={<Pencil />} onSelect={() => toast('Edit')}>
                Edit
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 />} tone="danger" onSelect={() => toast('Delete')}>
                Delete
              </MenuItem>
            </DropdownMenu>
          </div>
        </KitSection>

        <KitSection title="Stats and tabs">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Problems" value="15" icon={<BookOpen />} hint="5 easy · 6 medium · 4 hard" />
            <Stat label="Judged today" value="1,284" icon={<Trophy />} />
            <Stat label="Loading" value="0" loading />
          </div>
          <Tabs defaultValue="description">
            <TabsList aria-label="Problem">
              <TabsTrigger value="description" icon={<BookOpen />}>
                Description
              </TabsTrigger>
              <TabsTrigger value="submissions" count={4}>
                My submissions
              </TabsTrigger>
            </TabsList>
            <TabsContent value="description" className="pt-3 text-sm text-muted">
              Underline tabs for page sections.
            </TabsContent>
            <TabsContent value="submissions" className="pt-3 text-sm text-muted">
              Four submissions.
            </TabsContent>
          </Tabs>
          <Tabs defaultValue="rating" variant="pills">
            <TabsList aria-label="Leaderboard">
              <TabsTrigger value="rating">By rating</TabsTrigger>
              <TabsTrigger value="solved">By solved</TabsTrigger>
            </TabsList>
          </Tabs>
        </KitSection>

        <KitSection title="States">
          <EmptyState
            compact
            icon={<Inbox />}
            title="No submissions yet"
            description="Submit a solution and it will show up here."
            action={<Button size="sm" leftIcon={<Plus />}>New submission</Button>}
          />
          <ErrorState
            compact
            error={new ApiError({ status: 503, code: 'INTERNAL', message: 'The server is unavailable right now.' })}
            onRetry={() => toast('Retrying')}
          />
          <SkeletonText lines={3} />
          <Skeleton className="h-8 w-40" />
        </KitSection>
      </div>

      <Card>
        <CardHeader title="Table" description="Sortable header, numeric cells, pagination." divider />
        <Table>
          <THead>
            <Tr>
              <Th sortable sorted={sort} onSort={() => setSort(sort === 'asc' ? 'desc' : 'asc')}>
                Title
              </Th>
              <Th>Difficulty</Th>
              <Th numeric>Acceptance</Th>
              <Th numeric>Submissions</Th>
            </Tr>
          </THead>
          <TBody>
            {(sort === 'asc' ? ROWS : [...ROWS].reverse()).map((row) => (
              <Tr key={row.title} interactive>
                <Td className="font-medium">{row.title}</Td>
                <Td>
                  <DifficultyBadge difficulty={row.difficulty} variant="text" />
                </Td>
                <Td numeric>{row.acceptance}</Td>
                <Td numeric>{row.submissions}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <div className="border-t border-border px-5 py-3">
          <Pagination page={page} pageSize={20} total={312} onPageChange={setPage} itemLabel="problems" />
        </div>
      </Card>

      <Card>
        <TableSkeleton rows={3} columns={4} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <KitSection title="Markdown">
          <Markdown source={SAMPLE_MD} />
        </KitSection>
        <KitSection title="Code editor">
          <CodeEditor
            language={language}
            value={code}
            onChange={setCode}
            height={320}
            path={`kit/${language}`}
            ariaLabel="Example solution"
            keybindings={[{ keys: 'Mod+Enter', run: () => toast('Mod+Enter in the editor') }]}
          />
        </KitSection>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Edit test case"
        description="Inputs and outputs are stored exactly as entered."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setDialogOpen(false)}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Textarea label="Input" mono defaultValue={'3\n1 2 3'} />
          <Textarea label="Expected output" mono defaultValue={'6'} />
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this problem?"
        description="Its tests and submissions are removed too. This cannot be undone."
        confirmLabel="Delete problem"
        tone="danger"
        onConfirm={() => new Promise((resolve) => setTimeout(resolve, 800))}
      />
    </Page>
  );
}

export default Component;
