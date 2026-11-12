-- Review round 2 (A-R2-04): the 60 s stuck-row reconciler filters non-terminal statuses ordered by
-- createdAt; without an index led by status it scans every (terminal) submission each sweep.

-- CreateIndex
CREATE INDEX "Submission_status_createdAt_idx" ON "Submission"("status", "createdAt");
