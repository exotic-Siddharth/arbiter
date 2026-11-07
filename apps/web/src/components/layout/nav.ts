/** Primary navigation (Navbar, mobile menu, footer). */
export const MAIN_NAV = [
  { to: '/problems', label: 'Problems' },
  { to: '/contests', label: 'Contests' },
  { to: '/submissions', label: 'Submissions' },
  { to: '/leaderboard', label: 'Leaderboard' },
] as const;

/** Admin sidebar sections (spec 13.2 /admin). */
export const ADMIN_NAV = [
  { to: '/admin', label: 'Judge monitor', end: true },
  { to: '/admin/problems', label: 'Problems', end: false },
  { to: '/admin/contests', label: 'Contests', end: false },
  { to: '/admin/plagiarism', label: 'Plagiarism', end: false },
  { to: '/admin/users', label: 'Users', end: false },
] as const;
