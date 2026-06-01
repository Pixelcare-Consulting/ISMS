import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

/**
 * pino-pretty pipes to process.stdout. In Next.js dev, many workers/HMR passes
 * import this module and each transport adds listeners → MaxListenersExceededWarning.
 * Use pretty transport only in standalone Node scripts (seed, prisma), not in Next.
 */
const usePrettyTransport = isDev && !process.env.NEXT_RUNTIME;

const globalForLogger = globalThis as typeof globalThis & {
  __ismsLogger?: pino.Logger;
};

function createLogger() {
  return pino({
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    ...(usePrettyTransport
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true },
          },
        }
      : {}),
  });
}

export const logger = globalForLogger.__ismsLogger ?? createLogger();

if (isDev) {
  globalForLogger.__ismsLogger = logger;
}
