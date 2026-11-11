/** URL filters of the submission list (/submissions). */
export interface SubmissionFilterValues {
  mine: string;
  problem: string;
  verdict: string;
  language: string;
  username: string;
}

export const SUBMISSION_FILTER_DEFAULTS: SubmissionFilterValues = {
  mine: '',
  problem: '',
  verdict: '',
  language: '',
  username: '',
};
