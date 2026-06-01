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
