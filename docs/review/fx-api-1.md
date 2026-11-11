# fx-api-1 progress

## Progress
- [x] A-01
- [x] A-02 (api part; processor + judge/admin.ts guard are crossAreaNeeds)
- [x] A-03 (api part; DTO pendingSubmissions + ContestActions are crossAreaNeeds)
- [x] A-04
- [x] A-07 (api part; web client must reconnect on 'io server disconnect')
- [x] A-08
- [x] A-09
- [x] A-10

## Notes
Done. Full api suite (vitest, TEST_SCHEMA=fx_api_1): 35 files / 347 tests green; eslint, prettier --check and tsc clean.

Cross-area needs (for the integrator):
- A-02 apps/api/src/judge/processor.ts: testsTotal===0 -> IE with errorMessage (no acceptedCount increment); judge/admin.ts validate-reference + generate-outputs -> 409 when testCount is 0.
- A-03 shared ContestAdmin DTO: add pendingSubmissions; ContestActions.tsx disable Apply ratings and show "N submissions still judging" (server 409 is authoritative).
- A-07 web socket.ts: on 'disconnect' with reason 'io server disconnect' call client.connect() (server now closes the socket at access-token expiry).
- DESIGN.md decisions log: A-01 (admin routes re-read role from DB, self role change 403, demotion revokes refresh tokens), A-02, A-03 (409 rule), A-04, A-07, A-08 (demo/admin reserved), A-09, A-10.
- A-09: .env.example comment could state production rejects the dev secret (apps/api/.env.example is in prisma-free area but not in my list of owned files? left untouched).
