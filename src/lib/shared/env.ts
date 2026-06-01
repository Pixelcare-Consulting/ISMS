import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  AUDIT_LOG_HOT_DAYS: z.coerce.number().int().positive().optional(),
  SLOW_QUERY_MS: z.coerce.number().int().positive().optional(),
  SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    AUDIT_LOG_HOT_DAYS: process.env.AUDIT_LOG_HOT_DAYS,
    SLOW_QUERY_MS: process.env.SLOW_QUERY_MS,
    SENTRY_DSN: process.env.SENTRY_DSN,
  });
  if (result.success) return result.data;
  return {
    NODE_ENV: "development",
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    AUDIT_LOG_HOT_DAYS: process.env.AUDIT_LOG_HOT_DAYS
      ? Number.parseInt(process.env.AUDIT_LOG_HOT_DAYS, 10)
      : undefined,
    SLOW_QUERY_MS: process.env.SLOW_QUERY_MS
      ? Number.parseInt(process.env.SLOW_QUERY_MS, 10)
      : undefined,
    SENTRY_DSN: process.env.SENTRY_DSN,
  };
}

export const env = parseEnv();

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }
  return value as NonNullable<Env[K]>;
}
