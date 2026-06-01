import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
  });
  if (result.success) return result.data;
  return {
    NODE_ENV: "development",
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
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
