// Domain components shared by every feature (owned by S5). UI primitives live in
// '@/components/ui', layout in '@/components/layout'.
//
// CodeEditor and Markdown are deliberately NOT re-exported here: import them from
// '@/components/CodeEditor' and '@/components/Markdown' so their heavy dependencies (Monaco,
// KaTeX CSS) stay out of chunks that only need a badge.
export { Countdown, type CountdownProps } from './Countdown';
export { DifficultyBadge, type DifficultyBadgeProps } from './DifficultyBadge';
export { LiveIndicator, type LiveIndicatorProps } from './LiveIndicator';
export { RatingBadge, type RatingBadgeProps } from './RatingBadge';
export { TimeAgo, type TimeAgoProps } from './TimeAgo';
export { UserLink, type UserLinkProps } from './UserLink';
export { VerdictBadge, type VerdictBadgeProps } from './VerdictBadge';
export { tierColor, tierColorOf } from './tier';
