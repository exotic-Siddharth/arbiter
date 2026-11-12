import { describe, expect, it } from 'vitest';
import {
  ContestDetailSchema,
  CreateRunBody,
  CreateSubmissionBody,
  ErrorBodySchema,
  LANGUAGES,
  LANGUAGE_IDS,
  LIMITS,
  AdminContestBody,
  ListProblemsQuery,
  PageQuery,
  ScoreboardQuery,
  RATING_TIERS,
  RegisterBody,
  ScoreboardSchema,
  VERDICTS,
  getRatingTier,
  pageSchema,
  utf8ByteLength,
  MeSchema,
  Id,
  ContestRoomPayload,
} from './index';

const contestDetail = {
  slug: 'arbiter-round-1',
  title: 'Arbiter Round #1',
  startsAt: '2026-11-01T10:00:00.000Z',
  endsAt: '2026-11-01T12:00:00.000Z',
  status: 'ENDED',
  problemCount: 5,
  participantCount: 25,
  isRegistered: false,
  rated: true,
  descriptionMd: 'Five original problems.',
  penaltyMinutes: 20,
  serverTime: '2026-11-07T10:00:00.000Z',
  problems: [
    {
      label: 'A',
      title: 'Lantern Count',
      slug: 'lantern-count',
      solvedCount: 20,
      attemptedCount: 24,
      userStatus: null,
    },
  ],
};

describe('shared contracts', () => {
  it('RegisterBody rejects username "a"', () => {
    const result = RegisterBody.safeParse({
      email: 'a@example.com',
      username: 'a',
      password: 'longenough',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'username')).toBe(true);
    }
  });

  it('RegisterBody accepts a valid body and lower-cases the email', () => {
    const parsed = RegisterBody.parse({
      email: '  Ada@Example.COM ',
      username: 'ada_99',
      password: 'longenough',
    });
    expect(parsed.email).toBe('ada@example.com');
  });

  it('RegisterBody rejects usernames with invalid characters and short passwords', () => {
    expect(
      RegisterBody.safeParse({ email: 'a@example.com', username: 'bad name', password: 'x' })
        .success,
    ).toBe(false);
  });

  it('CreateSubmissionBody rejects 65537-byte source', () => {
    const base = { problemSlug: 'two-sum-ish', language: 'CPP' };
    expect(CreateSubmissionBody.safeParse({ ...base, sourceCode: 'x'.repeat(65537) }).success).toBe(
      false,
    );
    expect(CreateSubmissionBody.safeParse({ ...base, sourceCode: 'x'.repeat(65536) }).success).toBe(
      true,
    );
  });

  it('byte limits count UTF-8 bytes, not characters', () => {
    // "é" is 2 bytes in UTF-8: 32769 of them is 65538 bytes but only 32769 characters.
    const source = 'é'.repeat(32769);
    expect(utf8ByteLength(source)).toBe(65538);
    expect(
      CreateSubmissionBody.safeParse({ problemSlug: 'p', language: 'PYTHON', sourceCode: source })
        .success,
    ).toBe(false);
    expect(
      CreateRunBody.safeParse({ language: 'PYTHON', sourceCode: 'print(1)', input: source })
        .success,
    ).toBe(false);
  });

  it('ContestDetailSchema requires serverTime', () => {
    expect(ContestDetailSchema.safeParse(contestDetail).success).toBe(true);
    const { serverTime: _omitted, ...withoutServerTime } = contestDetail;
    const result = ContestDetailSchema.safeParse(withoutServerTime);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'serverTime')).toBe(true);
    }
  });

  it('ContestDetailSchema allows problems: null before the start', () => {
    expect(ContestDetailSchema.safeParse({ ...contestDetail, problems: null }).success).toBe(true);
  });

  it('every LANGUAGES template is non-empty', () => {
    expect(LANGUAGE_IDS).toEqual(['CPP', 'PYTHON', 'JAVA', 'JAVASCRIPT']);
    for (const id of LANGUAGE_IDS) {
      const language = LANGUAGES[id];
      expect(language.id).toBe(id);
      expect(language.template.trim().length).toBeGreaterThan(0);
      expect(language.fileName.length).toBeGreaterThan(0);
      expect(language.monacoId.length).toBeGreaterThan(0);
    }
  });

  it('LIMITS match the spec', () => {
    expect(LIMITS.sourceCodeBytes).toBe(65536);
    expect(LIMITS.runInputBytes).toBe(65536);
    expect(LIMITS.pageSizeMax).toBe(100);
  });

  it('VERDICTS cover every verdict with a label and colour', () => {
    for (const code of ['AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'OLE', 'IE'] as const) {
      expect(VERDICTS[code].label.length).toBeGreaterThan(0);
      expect(VERDICTS[code].color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('getRatingTier maps the tier boundaries', () => {
    expect(RATING_TIERS.map((tier) => tier.name)).toEqual([
      'Initiate',
      'Apprentice',
      'Adept',
      'Expert',
      'Master',
      'Grandmaster',
    ]);
    expect(getRatingTier(1199).name).toBe('Initiate');
    expect(getRatingTier(1200).name).toBe('Apprentice');
    expect(getRatingTier(1599).name).toBe('Adept');
    expect(getRatingTier(1600).name).toBe('Expert');
    expect(getRatingTier(2199).name).toBe('Master');
    expect(getRatingTier(2200).name).toBe('Grandmaster');
    expect(getRatingTier(-50).name).toBe('Initiate');
  });

  it('paging queries coerce strings, apply defaults and cap pageSize', () => {
    expect(ListProblemsQuery.parse({})).toMatchObject({ page: 1, pageSize: 20 });
    expect(ListProblemsQuery.parse({ page: '3', pageSize: '50' })).toMatchObject({
      page: 3,
      pageSize: 50,
    });
    expect(ListProblemsQuery.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(ListProblemsQuery.safeParse({ status: 'solved', sort: 'acceptance' }).success).toBe(
      true,
    );
  });

  it('pageSchema wraps items with paging metadata', () => {
    const schema = pageSchema(MeSchema);
    expect(schema.safeParse({ items: [], total: 0, page: 1, pageSize: 20 }).success).toBe(true);
    expect(schema.safeParse({ items: [] }).success).toBe(false);
  });

  it('ScoreboardSchema accepts a row with pending and firstSolve cells', () => {
    const board = {
      contestSlug: 'weekly',
      problems: [{ label: 'A' }, { label: 'B' }],
      rows: [
        {
          rank: 1,
          username: 'ada',
          rating: 1500,
          solved: 1,
          penalty: 42,
          cells: [
            {
              label: 'A',
              solved: true,
              attempts: 2,
              acMinute: 22,
              firstSolve: true,
              pending: false,
            },
            {
              label: 'B',
              solved: false,
              attempts: 0,
              acMinute: null,
              firstSolve: false,
              pending: true,
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      updatedAt: '2026-11-07T10:00:00.000Z',
    };
    expect(ScoreboardSchema.safeParse(board).success).toBe(true);
  });

  it('ErrorBodySchema matches the spec error shape', () => {
    expect(
      ErrorBodySchema.safeParse({ error: { code: 'NOT_FOUND', message: 'Problem not found' } })
        .success,
    ).toBe(true);
    expect(ErrorBodySchema.safeParse({ error: { code: 'NOPE', message: 'x' } }).success).toBe(
      false,
    );
  });

  it('bounds ?page so skip stays inside a safe integer range (A-25)', () => {
    expect(PageQuery.parse({ page: String(LIMITS.pageMax) }).page).toBe(LIMITS.pageMax);
    for (const page of ['1e21', '1e300', '99999999999', String(LIMITS.pageMax + 1), 'Infinity']) {
      expect(PageQuery.safeParse({ page }).success, page).toBe(false);
      expect(ScoreboardQuery.safeParse({ page }).success, page).toBe(false);
    }
    expect(LIMITS.pageMax * LIMITS.pageSizeMax).toBeLessThan(2 ** 31);
  });

  it('bounds the contest duration so solved x 10^7 - penalty orders correctly (A-50)', () => {
    const body = {
      slug: 'long-contest',
      title: 'Long',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-01-31T00:00:00.000Z',
    };
    expect(AdminContestBody.safeParse(body).success).toBe(true);
    const tooLong = { ...body, endsAt: '2027-01-01T00:00:00.000Z' };
    const result = AdminContestBody.safeParse(tooLong);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('endsAt');
  });

  it('rejects NUL characters in ids and room slugs (Postgres text cannot hold them)', () => {
    const nul = String.fromCharCode(0);
    expect(Id.safeParse('abc').success).toBe(true);
    expect(Id.safeParse(`a${nul}b`).success).toBe(false);
    expect(ContestRoomPayload.safeParse({ slug: 'round-1' }).success).toBe(true);
    expect(ContestRoomPayload.safeParse({ slug: `x${nul}` }).success).toBe(false);
  });
});
