/**
 * Run `worker` over `items` with at most `limit` promises in flight.
 *
 * Bulk importers use this instead of a sequential `for await` loop: the writes are
 * independent per row, so waiting out one database round trip before starting the
 * next wastes almost all of the wall clock on network latency.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const lanes = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: lanes }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    }),
  );

  return results;
}
