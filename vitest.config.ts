import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["**/*.integration.test.ts"],
          environment: "node",
          testTimeout: 30_000,
        },
      },
    ],
  },
});
