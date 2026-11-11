import type { AdminProblemSummary } from '@arbiter/shared';
import { ArrowDown, ArrowUp, ListPlus, Trash2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, EmptyState, IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { nextLabel, type ContestFormProblem } from '../lib/contestForm';
import { ContestProblemPicker } from './ContestProblemPicker';

export interface ContestProblemsEditorProps {
  problems: ContestFormProblem[];
  onChange: (problems: ContestFormProblem[]) => void;
  /** Field errors keyed "problems.<i>.label" and so on. */
  errors: Record<string, string>;
}

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Problem picker with labels. List order is the order contestants see (ordinal). */
export function ContestProblemsEditor({ problems, onChange, errors }: ContestProblemsEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedIds = new Set(problems.map((problem) => problem.problemId));

  const add = (problem: AdminProblemSummary) => {
    if (selectedIds.has(problem.id)) return;
    onChange([
      ...problems,
      {
        problemId: problem.id,
        label: nextLabel(problems.map((item) => item.label)),
        slug: problem.slug,
        title: problem.title,
      },
    ]);
  };
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= problems.length) return;
    const next = [...problems];
    const [item] = next.splice(index, 1);
    if (item) next.splice(target, 0, item);
    onChange(next);
  };
  const relabel = () =>
    onChange(problems.map((problem, index) => ({ ...problem, label: LABELS[index] ?? '' })));

  return (
    <Card>
      <CardHeader
        title="Problems"
        description="Labels are one or two upper-case letters. Contestants see the problems in this order."
        divider
        actions={
          <>
            {problems.length > 1 ? (
              <Button variant="ghost" size="sm" leftIcon={<Wand2 />} onClick={relabel}>
                Label A, B, C
              </Button>
            ) : null}
            <Button size="sm" leftIcon={<ListPlus />} onClick={() => setPickerOpen(true)}>
              Add problems
            </Button>
          </>
        }
      />
      <CardContent className="p-0">
        {problems.length === 0 ? (
          <EmptyState
            compact
            title="No problems yet"
            description="Add the problems for this round. They stay hidden from contestants until the start."
          />
        ) : (
          <ol aria-label="Contest problems" className="divide-y divide-border">
            {problems.map((problem, index) => {
              const error =
                errors[`problems.${index}.label`] ?? errors[`problems.${index}.problemId`];
              return (
                <li key={problem.problemId} className="flex items-start gap-3 px-5 py-3">
                  <div className="w-16 shrink-0">
                    <input
                      aria-label={`Label for ${problem.title}`}
                      aria-invalid={error ? true : undefined}
                      value={problem.label}
                      maxLength={2}
                      onChange={(event) =>
                        onChange(
                          problems.map((item, i) =>
                            i === index
                              ? { ...item, label: event.target.value.toUpperCase() }
                              : item,
                          ),
                        )
                      }
                      className={cn(
                        'h-9 w-full rounded-control border bg-surface text-center font-mono text-sm font-semibold uppercase',
                        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                        error ? 'border-danger' : 'border-border hover:border-border-strong',
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="truncate text-sm font-medium">{problem.title}</p>
                    <p className="truncate font-mono text-xs text-muted">{problem.slug}</p>
                    {error ? (
                      <p role="alert" className="mt-1 text-xs text-danger">
                        {error}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <IconButton
                      label={`Move ${problem.title} up`}
                      icon={<ArrowUp />}
                      variant="ghost"
                      size="sm"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    />
                    <IconButton
                      label={`Move ${problem.title} down`}
                      icon={<ArrowDown />}
                      variant="ghost"
                      size="sm"
                      disabled={index === problems.length - 1}
                      onClick={() => move(index, 1)}
                    />
                    <IconButton
                      label={`Remove ${problem.title}`}
                      icon={<Trash2 />}
                      variant="ghost"
                      size="sm"
                      onClick={() => onChange(problems.filter((_, i) => i !== index))}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
      <ContestProblemPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedIds={selectedIds}
        onAdd={add}
      />
    </Card>
  );
}
