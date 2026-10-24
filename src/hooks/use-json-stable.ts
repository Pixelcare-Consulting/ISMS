import { useMemo } from "react";

/**
 * Returns the same reference while `value`'s JSON is unchanged.
 *
 * Server props arrive as new objects on every router refresh (e.g. when a
 * server action re-sets the session cookie), which would re-run effects that
 * depend on them. Only for plain JSON data: functions, Dates and undefined
 * fields don't survive the round trip.
 */
export function useJsonStable<T>(value: T): T {
  const serialized = JSON.stringify(value);
  return useMemo(() => JSON.parse(serialized) as T, [serialized]);
}
