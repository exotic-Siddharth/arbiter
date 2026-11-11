import { describe, expect, it } from 'vitest';
import { ApiError } from './http';
import { retryPolicy } from './queryClient';

const error = (status: number, code: ApiError['code'] = 'INTERNAL') =>
  new ApiError({ status, code, message: 'x' });

describe('retryPolicy (R18)', () => {
  it('never retries 4xx responses', () => {
    for (const status of [400, 401, 403, 404, 409, 413, 429]) {
      expect(retryPolicy(0, error(status))).toBe(false);
    }
  });

  it('retries 5xx and network errors at most twice', () => {
    for (const failure of [
      error(500),
      error(503),
      error(0, 'NETWORK_ERROR'),
      new TypeError('boom'),
    ]) {
      expect(retryPolicy(0, failure)).toBe(true);
      expect(retryPolicy(1, failure)).toBe(true);
      expect(retryPolicy(2, failure)).toBe(false);
    }
  });

  it('does not retry responses that failed schema validation', () => {
    expect(retryPolicy(0, error(200, 'INVALID_RESPONSE'))).toBe(false);
  });
});
