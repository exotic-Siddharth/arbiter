import { describe, expect, it } from 'vitest';
import { paginate, toPage } from './pagination';

describe('paginate', () => {
  it('defaults to page 1 of 20', () => {
    expect(paginate()).toEqual({ skip: 0, take: 20, page: 1, pageSize: 20 });
  });

  it('computes skip/take', () => {
    expect(paginate({ page: 3, pageSize: 25 })).toEqual({
      skip: 50,
      take: 25,
      page: 3,
      pageSize: 25,
    });
  });

  it('clamps out-of-range and non-finite values', () => {
    expect(paginate({ page: 0, pageSize: 1000 })).toEqual({
      skip: 0,
      take: 100,
      page: 1,
      pageSize: 100,
    });
    expect(paginate({ page: -4, pageSize: 0 })).toMatchObject({ page: 1, pageSize: 1 });
    expect(paginate({ page: Number.NaN, pageSize: Number.POSITIVE_INFINITY })).toMatchObject({
      page: 1,
      pageSize: 20,
    });
    expect(paginate({ page: 2.7, pageSize: 10.9 })).toMatchObject({
      page: 2,
      pageSize: 10,
      skip: 10,
    });
  });

  it('toPage builds the paged body', () => {
    expect(toPage(['a', 'b'], 7, { page: 2, pageSize: 2 })).toEqual({
      items: ['a', 'b'],
      total: 7,
      page: 2,
      pageSize: 2,
    });
  });
});
