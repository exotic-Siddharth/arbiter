import { LANGUAGES, type PlagiarismPair } from '@arbiter/shared';
import { Button, TBody, THead, Table, Td, Th, Tr } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatPercent } from '@/lib/format';

function SimilarityCell({ value }: { value: number }) {
  const high = value >= 0.9;
  const medium = value >= 0.75;
  return (
    <div className="flex items-center justify-end gap-2.5">
      <span
        aria-hidden="true"
        className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-raised sm:block"
      >
        <span
          className={cn(
            'block h-full rounded-full',
            high ? 'bg-danger' : medium ? 'bg-warning' : 'bg-muted',
          )}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </span>
      <span
        className={cn('w-12 text-right font-mono font-medium tabular-nums', high && 'text-danger')}
      >
        {formatPercent(value, 0)}
      </span>
    </div>
  );
}

export function PairsTable({
  pairs,
  selectedId,
  onSelect,
}: {
  pairs: PlagiarismPair[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Table aria-label="Similar pairs">
      <THead>
        <Tr>
          <Th numeric className="w-12">
            #
          </Th>
          <Th>Problem</Th>
          <Th>Participants</Th>
          <Th numeric>Similarity</Th>
          <Th className="w-24">
            <span className="sr-only">Compare</span>
          </Th>
        </Tr>
      </THead>
      <TBody>
        {pairs.map((pair, index) => {
          const selected = pair.id === selectedId;
          return (
            <Tr
              key={pair.id}
              selected={selected}
              interactive
              className="cursor-pointer"
              onClick={() => onSelect(pair.id)}
            >
              <Td numeric muted>
                {index + 1}
              </Td>
              <Td className="max-w-[14rem]">
                <span className="block truncate">{pair.problemTitle}</span>
                <span className="block truncate font-mono text-xs text-muted">
                  {pair.problemSlug}
                </span>
              </Td>
              <Td>
                <span className="font-medium">{pair.a.username}</span>
                <span className="px-1.5 text-muted">vs</span>
                <span className="font-medium">{pair.b.username}</span>
                {pair.a.language !== pair.b.language ? (
                  <span className="block text-xs text-muted">
                    {LANGUAGES[pair.a.language].label} / {LANGUAGES[pair.b.language].label}
                  </span>
                ) : null}
              </Td>
              <Td numeric>
                <SimilarityCell value={pair.similarity} />
              </Td>
              <Td>
                <Button
                  size="xs"
                  variant={selected ? 'primary' : 'secondary'}
                  aria-pressed={selected}
                  aria-label={`Compare ${pair.a.username} and ${pair.b.username}`}
                  onClick={() => onSelect(pair.id)}
                >
                  {selected ? 'Comparing' : 'Compare'}
                </Button>
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </Table>
  );
}
