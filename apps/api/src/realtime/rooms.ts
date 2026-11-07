/** Socket.IO room names (spec section 11). */
export const rooms = {
  /** Every authenticated socket of a user (submission:done, run:result). */
  user: (userId: string) => `user:${userId}`,
  /** Live progress of one submission (owner or admin). */
  submission: (submissionId: string) => `submission:${submissionId}`,
  /** Live scoreboard of one contest; keyed by contest id, not slug. */
  contest: (contestId: string) => `contest:${contestId}`,
  /** The landing-page "recently judged" feed. */
  feed: 'feed',
} as const;
