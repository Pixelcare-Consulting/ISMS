export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationInput {
  page?: number;
  limit?: number;
}

/** Longest list search term the server accepts; longer input is cut. */
export const LIST_SEARCH_MAX_LENGTH = 100;

/** A list search term from the URL, trimmed and capped. Undefined when blank. */
export function parseListSearch(value?: string | null): string | undefined {
  const q = value?.trim().slice(0, LIST_SEARCH_MAX_LENGTH);
  return q || undefined;
}

export function resolvePagination(input?: PaginationInput) {
  const limit = input?.limit ?? 25;
  const page = Math.max(1, input?.page ?? 1);
  const skip = (page - 1) * limit;
  return { page, limit, skip, take: limit };
}

export function toPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
