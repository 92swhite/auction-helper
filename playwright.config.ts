import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
export default defineConfig({
  testDir: "./frontend/tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:1420",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev:browser",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      AUCTION_HELPER_DB: join(
        tmpdir(),
        `auction-helper-e2e-${process.pid}-${Date.now()}.db`,
      ),
    },
  },
});
