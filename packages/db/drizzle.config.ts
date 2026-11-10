import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["omnirouter"],
  dbCredentials: {
    url: process.env.OMR_MIGRATION_URL ?? "",
  },
});
