import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrationsPath = path.join(process.cwd(), "migrations");
      const migrations = await readD1Migrations(migrationsPath);
      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            ADMIN_EMAIL: "admin@example.test",
            ADMIN_PASSWORD: "test-password-only",
            SESSION_SECRET: "test-session-secret-only",
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ["./test/setup.js"],
    include: ["./test/**/*.test.js"],
  },
});
