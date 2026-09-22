import nextJest from "next/jest.js";

// next/jest wires up SWC, next.config.ts, .env.test and CSS/image mocks.
const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  // Unit tests default to Node (services, lib, schemas). Component tests opt
  // into the DOM with a docblock:  /** @jest-environment jsdom */
  testEnvironment: "node",
  // Unit tests live in tests/unit, mirroring src/ (tests/unit/lib/shared/env.test.ts ↔ src/lib/shared/env.ts).
  roots: ["<rootDir>/tests/unit"],
  setupFilesAfterEnv: ["<rootDir>/tests/jest.setup.ts"],
  testMatch: ["<rootDir>/tests/unit/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@prisma/client$": "<rootDir>/src/lib/database/generated/prisma/client",
    "^@prisma/client/(.*)$": "<rootDir>/src/lib/database/generated/prisma/$1",
  },
  clearMocks: true,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/lib/database/generated/**",
    "!src/app/**/{layout,loading,error,not-found,page}.tsx",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text-summary", "lcov"],
};

export default createJestConfig(config);
