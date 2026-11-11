import { LIMITS, type Page } from '@arbiter/shared';

export interface PageParams {
  page: number;
  pageSize: number;
}

export interface Pagination extends PageParams {
  /** Prisma `skip` */
  skip: number;
  /** Prisma `take` */
  take: number;
}

function whole(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.floor(value) : fallback;
}

/** ?page&pageSize (already parsed by PageQuery) -> Prisma skip/take. Clamps 1 <= page <= pageMax, 1 <= pageSize <= 100. */
export function paginate(query: Partial<PageParams> = {}): Pagination {
  const page = Math.min(LIMITS.pageMax, Math.max(1, whole(query.page, 1)));
  const pageSize = Math.min(
    LIMITS.pageSizeMax,
    Math.max(1, whole(query.pageSize, LIMITS.pageSizeDefault)),
  );
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

/** Build the `{ items, total, page, pageSize }` response body. */
export function toPage<T>(items: T[], total: number, params: PageParams): Page<T> {
  return { items, total, page: params.page, pageSize: params.pageSize };
}
