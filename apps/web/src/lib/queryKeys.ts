/**
 * TanStack Query keys shared across features, so one lane can invalidate another lane's data
 * (e.g. a judged submission refreshes the problem list's userStatus and the scoreboard).
 * Keys are hierarchical: invalidating qk.problems.all also covers every list and detail.
 *
 *   useQuery({ queryKey: qk.problems.list(params), queryFn: ... })
 *   queryClient.invalidateQueries({ queryKey: qk.submissions.all })
 */
type Params = Readonly<Record<string, unknown>>;

export const qk = {
  stats: ['stats'] as const,
  tags: ['tags'] as const,

  problems: {
    all: ['problems'] as const,
    list: (params: Params = {}) => ['problems', 'list', params] as const,
    detail: (slug: string) => ['problems', 'detail', slug] as const,
  },

  submissions: {
    all: ['submissions'] as const,
    list: (params: Params = {}) => ['submissions', 'list', params] as const,
    detail: (id: string) => ['submissions', 'detail', id] as const,
  },

  runs: {
    detail: (runId: string) => ['runs', runId] as const,
  },

  contests: {
    all: ['contests'] as const,
    list: (status: string = 'all') => ['contests', 'list', status] as const,
    detail: (slug: string) => ['contests', 'detail', slug] as const,
    problem: (slug: string, label: string) => ['contests', 'problem', slug, label] as const,
    scoreboard: (slug: string, params: Params = {}) =>
      ['contests', 'scoreboard', slug, params] as const,
    submissions: (slug: string, params: Params = {}) =>
      ['contests', 'submissions', slug, params] as const,
  },

  users: {
    all: ['users'] as const,
    profile: (username: string) => ['users', 'profile', username.toLowerCase()] as const,
  },

  leaderboard: (params: Params = {}) => ['leaderboard', params] as const,

  admin: {
    all: ['admin'] as const,
    judge: ['admin', 'judge'] as const,
    job: (id: string) => ['admin', 'jobs', id] as const,
    problems: {
      all: ['admin', 'problems'] as const,
      list: (params: Params = {}) => ['admin', 'problems', 'list', params] as const,
      detail: (id: string) => ['admin', 'problems', 'detail', id] as const,
      tests: (id: string) => ['admin', 'problems', 'tests', id] as const,
      test: (id: string, testId: string) => ['admin', 'problems', 'test', id, testId] as const,
    },
    contests: {
      all: ['admin', 'contests'] as const,
      list: (params: Params = {}) => ['admin', 'contests', 'list', params] as const,
      detail: (id: string) => ['admin', 'contests', 'detail', id] as const,
    },
    plagiarism: {
      all: ['admin', 'plagiarism'] as const,
      list: (params: Params = {}) => ['admin', 'plagiarism', 'list', params] as const,
      detail: (id: string) => ['admin', 'plagiarism', 'detail', id] as const,
    },
    users: {
      all: ['admin', 'users'] as const,
      list: (params: Params = {}) => ['admin', 'users', 'list', params] as const,
    },
  },
} as const;
