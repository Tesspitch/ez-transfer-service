import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { Buffer } from "node:buffer";
import workerd from "workerd";
process.env.MINIFLARE_WORKERD_PATH =
  typeof workerd === "string" ? workerd : workerd.default;
import { getWorkerBundleDir } from "@cloudflare/build-output-utils";
import path from "node:path";
const bindings = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test",
  R2_ACCOUNT_ID: "test",
  R2_BUCKET: "test-staging",
  R2_ACCESS_KEY_ID: "test",
  R2_SECRET_ACCESS_KEY: "test",
  SHARE_CODE_KEYS: JSON.stringify({ v1: Buffer.alloc(32).toString("base64") }),
  SHARE_CODE_ACTIVE_KEY: "v1",
  APP_ORIGIN: "https://app.example",
};
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: path.join(getWorkerBundleDir(process.cwd()), "index.js"),
    compatibilityDate: "2026-11-13",
    compatibilityFlags: ["nodejs_compat"],
    bindings,
    assets: {
      directory: path.resolve("dist/client"),
      binding: "ASSETS",
      run_worker_first: ["/api", "/api/*"],
      routerConfig: { has_user_worker: true },
      assetConfig: { not_found_handling: "single-page-application" },
    },
  }),
);
try {
  for (const pathname of ["/api/me", "/api/unknown", "/api"]) {
    const r = await mf.dispatchFetch("https://app.example" + pathname);
    if (r.status !== 401)
      throw new Error(
        `Expected API authentication for ${pathname}, received ${r.status}: ${await r.text()}`,
      );
  }
  const response = await mf.dispatchFetch("https://app.example/receive");
  if (response.status !== 200 || !(await response.text()).includes('id="root"'))
    throw new Error("SPA assets unavailable");
  console.log(
    "Workers runtime: authentication boundary and SPA routing verified.",
  );
} finally {
  await mf.dispose();
}
