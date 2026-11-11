import { DIFFICULTIES, type Difficulty } from '@arbiter/shared';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';

export interface DifficultyBadgeProps {
  difficulty: Difficulty;
  /** badge = tinted pill (default), text = coloured label only (dense tables). */
  variant?: 'badge' | 'text';
  size?: 'sm' | 'md';
  className?: string;
}

/** Easy / Medium / Hard in the spec 13.1 difficulty colours (--color-difficulty-*). */
export function DifficultyBadge({
  difficulty,
  variant = 'badge',
  size = 'md',
  className,
}: DifficultyBadgeProps) {
  const info = DIFFICULTIES[difficulty];
  const color = `var(--color-${info.token})`;
  if (variant === 'text') {
    return (
      <span
        data-difficulty={difficulty}
        style={{ color }}
        className={cn('text-[13px] font-medium', className)}
      >
        {info.label}
      </span>
    );
  }
  return (
    <Badge data-difficulty={difficulty} color={color} size={size} className={className}>
      {info.label}
    </Badge>
  );
}
