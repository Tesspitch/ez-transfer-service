import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { existsSync } from "node:fs";
import path from "node:path";
import { getWorkerBundleDir } from "@cloudflare/build-output-utils";
import workerd from "workerd";
process.env.MINIFLARE_WORKERD_PATH =
  typeof workerd === "string" ? workerd : workerd.default;
if (existsSync(".dev.vars")) process.loadEnvFile(".dev.vars");
const names = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCOUNT_ID",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "SHARE_CODE_KEYS",
  "SHARE_CODE_ACTIVE_KEY",
  "APP_ORIGIN",
];
for (const name of names)
  if (!process.env[name])
    throw new Error(
      `Configure ${name} in .dev.vars before starting the Worker`,
    );
const bindings = Object.fromEntries(
  names.map((name) => [name, process.env[name]]),
);
bindings.DIRECT_UPLOAD_VERIFIED = "false";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: path.join(getWorkerBundleDir(process.cwd()), "index.js"),
    compatibilityDate: "2026-11-13",
    compatibilityFlags: ["nodejs_compat"],
    bindings,
    host: "127.0.0.1",
    port: 8787,
    assets: {
      directory: path.resolve("dist/client"),
      binding: "ASSETS",
      run_worker_first: ["/api", "/api/*"],
      routerConfig: { has_user_worker: true },
      assetConfig: { not_found_handling: "single-page-application" },
    },
  }),
);
console.log(`Worker listening at ${await mf.ready}`);
for (const event of ["SIGINT", "SIGTERM"])
  process.once(event, () => void mf.dispose().then(() => process.exit(0)));
