import { defineConfig, bindings, triggers } from "cf/config";
export default defineConfig(({ mode }) => ({
  worker: {
    name:
      mode === "staging" ? "terminal-transfer-staging" : "terminal-transfer",
    entrypoint: "./src/worker/index.ts",
    compatibilityDate: "2026-11-13",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api", "/api/*"],
    },
    triggers: [triggers.scheduled({ schedule: "* * * * *" })],
    observability: {
      enabled: true,
      headSamplingRate: 0.1,
      redactQueryString: true,
      logs: { enabled: true, invocationLogs: false },
      traces: { enabled: true, headSamplingRate: 0.1 },
    },
    env: {
      ASSETS: bindings.assets(),
      SUPABASE_URL: bindings.text(
        process.env.SUPABASE_URL ?? "https://YOUR_PROJECT.supabase.co",
      ),
      R2_ACCOUNT_ID: bindings.text(
        process.env.R2_ACCOUNT_ID ?? "YOUR_ACCOUNT_ID",
      ),
      R2_BUCKET: bindings.text(
        process.env.R2_BUCKET ?? "terminal-transfer-staging",
      ),
      APP_ORIGIN: bindings.text(process.env.APP_ORIGIN ?? "auto"),
      DIRECT_UPLOAD_VERIFIED: bindings.text("false"),
      SHARE_CODE_ACTIVE_KEY: bindings.text(
        process.env.SHARE_CODE_ACTIVE_KEY ?? "v1",
      ),
      SUPABASE_SERVICE_ROLE_KEY: bindings.secret(),
      R2_ACCESS_KEY_ID: bindings.secret(),
      R2_SECRET_ACCESS_KEY: bindings.secret(),
      SHARE_CODE_KEYS: bindings.secret(),
    },
  },
}));
