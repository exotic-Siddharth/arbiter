# Lane A3a: problems, submissions, admin problem content

## Progress

- [x] Read spec, plan (A3, R1-R20), backend handoff
- [x] Mappers: problems/mappers.ts (toProblemSummary, toProblemDetail), submissions/mappers.ts (toSubmissionSummary, toSubmissionDetail)
- [x] Tests written (problems/problems.test.ts, submissions/submissions.test.ts, admin/problems.test.ts), seen failing (501)
- [x] problems service + routes + tags implemented, passing (16/16)
- [x] submissions service + routes implemented, passing (26/26)
- [x] admin problems + tests CRUD implemented (problems/admin.service.ts), passing (15/15)
- [x] Gate: tsc (no errors in own files), eslint clean, prettier clean

Test command (from apps/api): `TEST_SCHEMA=lane_a3a TEST_REDIS_URL=redis://localhost:56379/3 npx vitest run src/modules/problems src/modules/submissions src/modules/admin/problems`

### Mapper contract (stable; lane A3b imports these)

- `apps/api/src/modules/problems/mappers.ts`
  - `problemDetailInclude` (Prisma include: tags + sample testCases in ordinal order), `problemSummaryInclude`.
  - `toProblemDetail(row: ProblemDetailRow, options?: { userStatus?: 'SOLVED'|'ATTEMPTED'|null; contest?: {slug, label} }): ProblemDetail`. Any row loaded with `problemDetailInclude` fits `ProblemDetailRow`. Non-sample test rows are dropped even if loaded.
  - `toProblemSummary(row, userStatus = null)`, `acceptanceRate(accepted, submissions)`.
- `apps/api/src/modules/problems/service.ts`: `userStatuses(prisma, userId | undefined, problemIds): Promise<Map<problemId, 'SOLVED'|'ATTEMPTED'>>` (NORMAL submissions only), for the contest problem userStatus.
- `apps/api/src/modules/submissions/mappers.ts`
  - `submissionSummaryInclude` (problem {slug,title}, user {username}, contest {slug}).
  - `toSubmissionSummary(row: SubmissionSummaryRow): SubmissionSummary`. Any row loaded with `submissionSummaryInclude` fits.
  - `submissionDetailInclude`, `toSubmissionDetail(row, viewer: { canSeeSource: boolean; isAdmin: boolean }): SubmissionDetail`.

## Integration needs

- A2 `enqueueSubmission` (judge/queue.ts) is still a stub that throws. Until it lands, every real POST /api/submissions ends FAILED/IE with errorMessage "Could not queue the submission for judging: not implemented: enqueueSubmission" and answers 500. The lane tests vi.mock it. Nothing to wire: the call site already uses the declared signature.
- A3b `recomputeRow` (contests/scoreboard.ts) is still a stub. POST /api/submissions calls it after storing an in-window contest submission (R3), then `emitter.emitScoreboardRow(contestId, {contestSlug, row})`. Errors from either call are caught and logged as a warning, so the request still answers 202. The tests mock it. Because emitScoreboardRow validates the row with ScoreRowSchema, the real recomputeRow must return schema-valid rows, or the pending-cell emit is dropped with only a warning in the log.
- A3b: GET /api/contests/:slug/submissions should apply the same rules as GET /api/submissions: kind NORMAL; while the contest runs, non-admins see only their own submissions. Map rows with `toSubmissionSummary` and `submissionSummaryInclude`. Use `toProblemDetail(row, {userStatus, contest: {slug, label}})` with `problemDetailInclude` for GET /contests/:slug/problems/:label, and `userStatuses()` for the userStatus.
- A2: POST /api/submissions already sets `testsTotal` to the problem's test count when the row is created. The processor may overwrite it when judging starts; nothing breaks either way.
- A6: GET /api/submissions?mine=true answers 401 to a guest, so send `mine=true` only when signed in. Hidden submissions (another user's REFERENCE submission, or another user's contest submission while the contest runs) answer 404 on GET /api/submissions/:id.
- A7: PUT /api/admin/problems/:id is a full replace, except that an omitted referenceLanguage/referenceSolution keeps the stored value; send null to clear it. Deleting a test does not renumber the others. POST /tests without an ordinal appends after the highest ordinal.
- I1: this lane did not re-run src/app.test.ts. Its /api/problems cases (400 for pageSize=1000, 401 for an invalid token) fail before any handler runs, so they should not be affected; confirm in the whole-repo run.

## Decisions

- 2026-11-08 (A3a) problems list: GET /api/problems lists published problems only, for admins too (spec section 9). Admins find drafts through /api/admin/problems. GET /api/problems/:slug also serves unpublished problems to admins. `search` matches the title or slug, case-insensitively. `tag` is a case-insensitive exact name match.
- 2026-11-08 (A3a) status filter: `solved` = some NORMAL AC by the user; `attempted` = some NORMAL submission (any status) and no AC; `unsolved` = not solved (attempted problems included). A guest has solved and attempted nothing: `solved`/`attempted` return nothing and `unsolved` returns everything. `userStatus` follows the same rules, and REFERENCE submissions never count (R7).
- 2026-11-08 (A3a) problem sorts: `newest` = createdAt desc. `difficulty` = EASY, MEDIUM, HARD, then title. `title` = title asc. `acceptance` = acceptance rate desc, then submissionCount desc, then title; it is ranked in memory over the filtered ids, because Prisma cannot order by a ratio. acceptanceRate is 0 when there are no submissions.
- 2026-11-08 (A3a) GET /api/tags: tags with no published problem are left out, so tags used only by drafts or by unstarted contest problems do not leak. The list is sorted by name.
- 2026-11-08 (A3a) submission visibility: non-admins see other users' submissions only when the problem is published, or belongs to a published contest that has started (the R11 rule). This keeps admin practice runs on draft or unstarted contest problems out of public lists. Others' contest submissions stay hidden until endsAt. Own submissions are always visible. GET /api/submissions/:id answers 404, not 403, for hidden submissions (REFERENCE submissions of others included). A guest's `mine=true` is a 401. failedSample = the first non-AC sample result by ordinal: the TestCase input/expected output plus the stored stdout/stderr previews (owner or admin only).
- 2026-11-08 (A3a) submission creation: `testsTotal` is set to the problem's test count when the row is created. With `contestSlug`, an unpublished contest is a 404 for non-admins and a problem outside the contest is a 404. Admins follow the same contest rules (unregistered during the contest gives 403); they can submit without `contestSlug` instead. If enqueueing fails, the submission is set to FAILED/IE with an errorMessage, judgedAt is set, and the API answers 500 INTERNAL, so nothing stays QUEUED forever (Review Focus 4). A failure in the R3 scoreboard recompute or emit is logged and does not fail the 202.
- 2026-11-08 (A3a) admin problems: PUT is a full replace. Exceptions: an omitted referenceLanguage/referenceSolution keeps the stored value (null clears it), and an omitted floatTolerance becomes null. Tag names are de-duplicated and created on first use; unused tags are not deleted. The authorId of a created problem is the calling admin. The admin list is newest first.
- 2026-11-08 (A3a) admin test cases: POST without an ordinal appends at max+1, and a taken ordinal gives 409. PUT keeps the ordinal when it is omitted. DELETE does not renumber. A bulk append continues from max+1. A bulk replace deletes every test and numbers the new ones from 1, in one transaction (timeout 120 s). The test list computes sizes (octet_length = UTF-8 bytes) and 256-character previews (left()) in Postgres with a tagged `$queryRaw`, so multi-MB inputs are never loaded.
