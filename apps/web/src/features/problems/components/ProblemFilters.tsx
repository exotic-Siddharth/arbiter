import type { TagCount } from '@arbiter/shared';
import { Search, X } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { useDebouncedUrlValue } from '../hooks/useUrlFilters';
import type { ProblemFilterValues } from '../lib/filters';

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const STATUS_OPTIONS = [
  { value: 'solved', label: 'Solved' },
  { value: 'attempted', label: 'Attempted' },
  { value: 'unsolved', label: 'Unsolved' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'acceptance', label: 'Acceptance' },
  { value: 'title', label: 'Title' },
];

export interface ProblemFiltersProps {
  values: ProblemFilterValues;
  tags: readonly TagCount[] | undefined;
  /** Signed-in users can filter by their solved/attempted status. */
  showStatus: boolean;
  active: boolean;
  onChange: (patch: Partial<ProblemFilterValues>, options?: { replace?: boolean }) => void;
  onClear: () => void;
}

/** Search, difficulty, tag, status and sort controls for the problem list (URL-synced). */
export function ProblemFilters({
  values,
  tags,
  showStatus,
  active,
  onChange,
  onClear,
}: ProblemFiltersProps) {
  const [search, setSearch] = useDebouncedUrlValue(values.search, (value) =>
    onChange({ search: value }, { replace: true }),
  );
  const tagOptions = (tags ?? []).map((tag) => ({
    value: tag.name,
    label: `${tag.name} (${tag.count})`,
  }));
  // Keep a tag from the URL selectable even before /tags answers.
  if (values.tag && !tagOptions.some((option) => option.value === values.tag)) {
    tagOptions.unshift({ value: values.tag, label: values.tag });
  }

  return (
    <div
      role="search"
      aria-label="Filter problems"
      className="flex flex-col gap-3 lg:flex-row lg:items-end"
    >
      <Input
        type="search"
        aria-label="Search problems"
        placeholder="Search by title…"
        leftIcon={<Search />}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        containerClassName="lg:max-w-xs lg:flex-1"
      />
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <Select
          label="Difficulty"
          placeholder="All difficulties"
          options={DIFFICULTY_OPTIONS}
          value={values.difficulty.toLowerCase()}
          onChange={(event) => onChange({ difficulty: event.target.value })}
          containerClassName="sm:w-40"
        />
        <Select
          label="Tag"
          placeholder="All tags"
          options={tagOptions}
          value={values.tag}
          onChange={(event) => onChange({ tag: event.target.value })}
          containerClassName="sm:w-48"
        />
        {showStatus ? (
          <Select
            label="Status"
            placeholder="Any status"
            options={STATUS_OPTIONS}
            value={values.status}
            onChange={(event) => onChange({ status: event.target.value })}
            containerClassName="sm:w-36"
          />
        ) : null}
        <Select
          label="Sort by"
          options={SORT_OPTIONS}
          value={values.sort}
          onChange={(event) => onChange({ sort: event.target.value })}
          containerClassName="sm:w-36"
        />
        {active ? (
          <Button
            variant="ghost"
            leftIcon={<X />}
            onClick={onClear}
            className="col-span-2 justify-self-start sm:col-span-1"
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
