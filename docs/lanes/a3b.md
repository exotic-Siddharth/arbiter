# Lane A3b: contests, scoreboard, rating, plagiarism, admin contests and plagiarism

## Progress

- [x] Read spec, plan, handoff; verified prior-attempt files icpc.fixture.ts / icpc.test.ts (fixture re-computed by hand: correct)
- [x] icpc.ts (computeRow, rankRows, computeStandings, firstSolveTimes, scoreOf): tests pass
- [x] rating.ts (computeRatingDeltas) + rating.test.ts pass
- [x] plagiarism/winnow.ts (tokenize, fingerprints, similarity) + winnow.test.ts pass
- [x] scoreboard.ts (recomputeRow, rebuildScoreboard, getScoreboard) + scoreboard.test.ts pass
- [x] contests routes (list, detail, register, scoreboard) + contests.test.ts pass
- [x] admin contests CRUD + rate + tests pass
- [x] plagiarism service (runPlagiarismReport) + admin plagiarism routes + tests pass
- [x] contest problem by label + contest submissions (A3a mappers toProblemDetail / toSubmissionSummary imported, no local copies)
- [x] Gate: tsc (zero errors in apps/api), eslint clean, prettier clean; full lane suite green

## Integration needs

- Seed (I1): import `computeRatingDeltas` from `apps/api/src/modules/contests/rating.ts` and `loadStandings(contestId, tx)` from `modules/contests/scoreboard.ts` to rate the seeded past contest exactly like `POST /api/admin/contests/:id/rate` (see `rateContest` in `modules/contests/admin.ts`; calling it directly with the seed's Prisma client is the simplest option). It writes RatingChange rows, updates User.rating and sets ratedAt in one transaction.
- Seed (I1): after seeding contest submissions, nothing has to be written to Redis: `getScoreboard` rebuilds `contest:<id>:rank|rows` from Postgres on first read. If the seed re-runs against a dev Redis that still holds old keys for re-created contests, ids are new cuids, so stale keys are harmless (they are never read).
- Wiring check (I1): `judge/processor.ts` (A2) and `modules/submissions/service.ts` (A3a) already call `recomputeRow(contestId, userId)` and emit `scoreboard:row`; `worker.ts` already calls `runPlagiarismReport(job.data.reportId)`. No other caller is needed. `runPlagiarismReport` never throws for a job-level failure (it marks the report FAILED), so BullMQ will not retry it; that is intended.
- `enqueuePlagiarism` is vi.mocked in `modules/admin/plagiarism.test.ts`; the integration e2e should exercise the real queue + worker path once (POST /api/admin/plagiarism, then poll GET /api/admin/plagiarism/:id until DONE).
- Scoreboard cache keys are not prefixed with QUEUE_PREFIX (spec section 9 names them `contest:<id>:...`). Tests are isolated by unique contest ids; e2e on Redis DB 9 is unaffected.

## Decisions

- 2026-11-08 (A3b) Scoreboard cache: besides `contest:<id>:rank` (ZSET) and `contest:<id>:rows` (HASH), two helper keys exist: `contest:<id>:updatedAt` (ISO time of the last write, served as Scoreboard.updatedAt) and `contest:<id>:lock` (SET NX PX 15 s rebuild lock; waiters poll up to 10 s). The cache counts as built when the rank ZSET exists; a contest with no participants is recomputed on each read (two cheap queries).
- 2026-11-08 (A3b) recomputeRow builds the whole cache first when it is missing, so a single write never leaves a one-row scoreboard. When the recomputed row takes a first solve (an earlier AC judged late), the rows of users who held that firstSolve are recomputed too. Known gap: a full rebuild racing with a concurrent recomputeRow can briefly write a row read just before the new verdict; the next recompute or rebuild fixes it.
- 2026-11-08 (A3b) Scoreboard rows show the user's current rating (User.rating). Admin edits (PUT/DELETE contest) and rating application drop the cache so it is rebuilt on the next read.
- 2026-11-08 (A3b) Scoreboard tie order inside equal (solved, penalty) follows the ZSET member order (userId, descending); ties share a rank as specified.
- 2026-11-08 (A3b) Only NORMAL submissions by registrants with a contestId count for the scoreboard, the contest problem stats, plagiarism and rating (R7). A FAILED submission (IE) and DONE/CE are never attempts; pending submissions before the first AC set `pending`, after it they are ignored. acMinute is clamped at 0.
- 2026-11-08 (A3b) ContestDetail.problems[].attemptedCount = distinct users with at least one contest submission on the problem (solvers included); solvedCount = distinct users with an AC. userStatus (in the detail and in GET /contests/:slug/problems/:label) comes from the viewer's contest submissions only.
- 2026-11-08 (A3b) Public contest routes show published contests; admins can also open unpublished ones by slug (detail, problems, scoreboard, submissions, register). GET /api/contests lists published contests only, for admins too (the admin list covers the rest). Ordering: upcoming by startsAt asc, running by endsAt asc, past by endsAt desc, no filter by startsAt desc.
- 2026-11-08 (A3b) Contest problem labels in GET /api/contests/:slug/problems/:label are case-insensitive (`a` = `A`). Before the start a non-admin gets 404 (not 403), matching the route definition.
- 2026-11-08 (A3b) GET /api/contests/:slug/submissions: while the contest is not over (upcoming or running), non-admins always get only their own submissions; after the end everyone's are listed (metadata only: SubmissionSummary has no source). Admins always see all. Newest first.
- 2026-11-08 (A3b) Admin contests: unknown problem ids in the body give 400 VALIDATION_ERROR with details path `problems.<i>.problemId`; duplicate labels/problems are rejected by the shared schema (400); slug clashes give 409. PUT replaces the problem list (ordinal = array order). participantCount = registrations.
- 2026-11-08 (A3b) Rating: participants are registrants with at least one counted contest submission (registrants who never submitted are not rated). The transaction claims the contest with a conditional `ratedAt: null -> now` update, so concurrent calls rate once (the loser gets 409). Interactive transaction timeout 60 s. The response lists changes in rank order.
- 2026-11-08 (A3b) Rating with N < 2 participants gives a delta of 0 (RatingChange rows are still written, and ratedAt is set).
- 2026-11-08 (A3b) Plagiarism tokenizer: C-style `//` and `/* */` comments for CPP/JAVA/JAVASCRIPT, `#` for PYTHON; Python string prefixes (f, r, b, rb, ...) and triple quotes, Java text blocks and JS template literals are single S tokens; unterminated literals/comments never throw. k-grams are hashed as the token kinds joined by single spaces (UTF-8 bytes, 64-bit FNV-1a as BigInt). A program shorter than k tokens gets one fingerprint over all its tokens. Pairs with similarity 0 are never stored, even with threshold 0.
- 2026-11-08 (A3b) Plagiarism compares every pair of participants per problem regardless of language (spec wording); side A of a pair is the earlier submission. matchedLines = distinct lines of the tokens in shared fingerprints. Re-running a report replaces its pairs. If enqueueing fails, POST /api/admin/plagiarism marks the report FAILED and answers 500. GET /api/admin/plagiarism returns at most the 200 newest reports; pairs whose submissions or problem were deleted are left out of the detail.
