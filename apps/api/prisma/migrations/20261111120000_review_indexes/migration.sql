-- Review A-26 / A-51: indexes for the leaderboard / stats aggregates and for foreign keys that
-- Postgres scans on cascades and reverse lookups.

-- CreateIndex
CREATE INDEX "User_rating_idx" ON "User"("rating");

-- CreateIndex
CREATE INDEX "Problem_authorId_idx" ON "Problem"("authorId");

-- CreateIndex
CREATE INDEX "ProblemTag_tagId_idx" ON "ProblemTag"("tagId");

-- CreateIndex
CREATE INDEX "Submission_verdict_userId_problemId_idx" ON "Submission"("verdict", "userId", "problemId");

-- CreateIndex
CREATE INDEX "ContestProblem_problemId_idx" ON "ContestProblem"("problemId");

-- CreateIndex
CREATE INDEX "ContestRegistration_userId_idx" ON "ContestRegistration"("userId");

-- CreateIndex
CREATE INDEX "RatingChange_contestId_idx" ON "RatingChange"("contestId");

-- CreateIndex
CREATE INDEX "PlagiarismReport_contestId_idx" ON "PlagiarismReport"("contestId");
