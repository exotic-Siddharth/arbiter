/* eslint-disable @typescript-eslint/no-unused-vars -- scaffold stub: lane A3 implements it (keep the signature) */

/**
 * Runs a PlagiarismReport (winnowing, spec section 9): sets status RUNNING, compares the
 * submissions, stores PlagiarismPair rows above the threshold, then DONE (or FAILED with error).
 * Called by the worker for jobs on the `plagiarism` queue. Owner: lane A3.
 */
export async function runPlagiarismReport(reportId: string): Promise<void> {
  throw new Error('not implemented: runPlagiarismReport');
}
