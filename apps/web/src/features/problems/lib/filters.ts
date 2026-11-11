/** URL filters of the problem list (/problems). */
export interface ProblemFilterValues {
  search: string;
  difficulty: string;
  tag: string;
  status: string;
  sort: string;
}

export const PROBLEM_FILTER_DEFAULTS: ProblemFilterValues = {
  search: '',
  difficulty: '',
  tag: '',
  status: '',
  sort: 'newest',
};
