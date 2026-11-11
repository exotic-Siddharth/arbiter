import { AdminProblemPageSchema, type AdminProblemSummary } from '@arbiter/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DifficultyBadge } from '@/components';
import { Badge, Button, Dialog, EmptyState, Input, QueryState, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';

export interface ContestProblemPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Problem ids already in the contest (shown as added). */
  selectedIds: ReadonlySet<string>;
  onAdd: (problem: AdminProblemSummary) => void;
}

/** Search every problem (published or not) and add it to the contest; stays open to add more. */
export function ContestProblemPicker({
  open,
  onOpenChange,
  selectedIds,
  onAdd,
}: ContestProblemPickerProps) {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);

  const query = { search: search || undefined, page: 1, pageSize: 30 };
  const problems = useQuery({
    queryKey: qk.admin.problems.list(query),
    queryFn: ({ signal }) =>
      api.get('/admin/problems', { query, schema: AdminProblemPageSchema, signal }),
    enabled: open,
    placeholderData: (previous) => previous,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add problems"
      description="Pick from every problem, published or not. Draft problems stay hidden until the contest starts."
      size="lg"
      footer={<Button onClick={() => onOpenChange(false)}>Done</Button>}
    >
      <div className="space-y-3">
        <Input
          aria-label="Search problems"
          placeholder="Search by title or slug"
          leftIcon={<Search />}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="max-h-[22rem] overflow-auto rounded-control border border-border scrollbar-thin">
          <QueryState
            query={problems}
            compact
            loading={
              <div className="space-y-px">
                {[0, 1, 2, 3, 4].map((key) => (
                  <Skeleton key={key} className="h-12 w-full rounded-none" />
                ))}
              </div>
            }
            isEmpty={(data) => data.items.length === 0}
            empty={
              <EmptyState
                compact
                title="No problems match"
                description="Try another title or slug."
              />
            }
          >
            {(data) => (
              <ul className="divide-y divide-border">
                {data.items.map((problem) => {
                  const added = selectedIds.has(problem.id);
                  return (
                    <li key={problem.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{problem.title}</p>
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                          <span className="font-mono">{problem.slug}</span>
                          <DifficultyBadge difficulty={problem.difficulty} variant="text" />
                          {problem.isPublished ? null : (
                            <Badge size="sm" tone="neutral">
                              Draft
                            </Badge>
                          )}
                          <span>{problem.testCount} tests</span>
                        </p>
                      </div>
                      {added ? (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <Check aria-hidden="true" className="size-3.5" />
                          Added
                        </span>
                      ) : (
                        <Button
                          size="xs"
                          variant="secondary"
                          leftIcon={<Plus />}
                          aria-label={`Add ${problem.title}`}
                          onClick={() => onAdd(problem)}
                        >
                          Add
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryState>
        </div>
        {problems.data && problems.data.total > problems.data.items.length ? (
          <p className="text-xs text-muted">
            Showing the first {problems.data.items.length} of {problems.data.total} problems. Narrow
            the search.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
