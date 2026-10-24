jest.mock("@upstash/redis", () => ({
  Redis: jest.fn().mockImplementation(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  })),
}));

import { deleteCache, getCache, getOrSet } from "@/lib/cache/redis";

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();

const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;

process.env.UPSTASH_REDIS_REST_URL = "https://cache-test.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "cache-test-token";

function restoreEnv(name: "UPSTASH_REDIS_REST_URL" | "UPSTASH_REDIS_REST_TOKEN", value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

let keySeq = 0;
function cacheKey(label: string): string {
  keySeq += 1;
  return `redis-unit:${label}:${keySeq}`;
}

afterAll(() => {
  restoreEnv("UPSTASH_REDIS_REST_URL", previousUrl);
  restoreEnv("UPSTASH_REDIS_REST_TOKEN", previousToken);
});

describe("redis cache", () => {
  it("runs fetchFn once when two getOrSet calls miss together", async () => {
    const key = cacheKey("single-flight");
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue("OK");

    let release: (value: { n: number }) => void = () => {};
    const gate = new Promise<{ n: number }>((resolve) => {
      release = resolve;
    });
    let started: () => void = () => {};
    const startedGate = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fetchFn = jest.fn(async () => {
      started();
      return gate;
    });

    const first = getOrSet(key, 60, fetchFn);
    const second = getOrSet(key, 60, fetchFn);

    await startedGate;
    expect(fetchFn).toHaveBeenCalledTimes(1);

    release({ n: 1 });
    await expect(first).resolves.toEqual({ n: 1 });
    await expect(second).resolves.toEqual({ n: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("serves the second getCache read from memory without calling Redis again", async () => {
    const key = cacheKey("hydrate");
    mockRedisGet.mockResolvedValue({ sku: "A" });

    await expect(getCache<{ sku: string }>(key)).resolves.toEqual({ sku: "A" });
    expect(mockRedisGet).toHaveBeenCalledTimes(1);

    mockRedisGet.mockClear();
    await expect(getCache<{ sku: string }>(key)).resolves.toEqual({ sku: "A" });
    expect(mockRedisGet).not.toHaveBeenCalled();
  });

  it("never calls Redis for a local-only getOrSet", async () => {
    const key = cacheKey("local-only");
    mockRedisGet.mockClear();
    mockRedisSet.mockClear();
    mockRedisDel.mockClear();

    const fetchFn = jest.fn(async () => "catalog");
    await expect(getOrSet(key, 300, fetchFn, { localOnly: true })).resolves.toBe("catalog");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(mockRedisGet).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(mockRedisDel).not.toHaveBeenCalled();

    const again = jest.fn(async () => "other");
    await expect(getOrSet(key, 300, again, { localOnly: true })).resolves.toBe("catalog");
    expect(again).not.toHaveBeenCalled();
    expect(mockRedisGet).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it("does not keep a value that deleteCache removed during the load", async () => {
    const key = cacheKey("delete-during-flight");
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue("OK");
    mockRedisDel.mockResolvedValue(1);

    let release: (value: string) => void = () => {};
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });
    const fetchFn = jest.fn(async () => gate);
    const flight = getOrSet(key, 60, fetchFn);

    await Promise.resolve();
    await deleteCache(key);
    release("stale");
    await expect(flight).resolves.toBe("stale");

    mockRedisGet.mockClear();
    mockRedisSet.mockClear();
    const refetch = jest.fn(async () => "fresh");
    await expect(getOrSet(key, 60, refetch)).resolves.toBe("fresh");
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
