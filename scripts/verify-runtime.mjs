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
  APP_ORIGIN: "auto",
};
const mf = new Miniflare(
  convertV4MiniflareOptions({
    outboundService: async () =>
      new Response("{}", { headers: { "Content-Type": "application/json" } }),
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
    const r = await mf.dispatchFetch("https://app.example" + pathname, {
      headers: { "CF-Connecting-IP": "192.0.2.1" },
    });
    if (r.status !== 404)
      throw new Error(
        `Expected public API routing for ${pathname}, received ${r.status}: ${await r.text()}`,
      );
  }
  const same = await mf.dispatchFetch("https://app.example/api/transfers", {
    method: "POST",
    headers: { Origin: "https://app.example", "CF-Connecting-IP": "192.0.2.1" },
  });
  if (same.status !== 404)
    throw new Error(
      "Auto origin must accept same-origin requests while requiring an owner capability",
    );
  const cross = await mf.dispatchFetch("https://app.example/api/transfers", {
    method: "POST",
    headers: { Origin: "https://evil.example" },
  });
  if (cross.status !== 403)
    throw new Error("Auto origin must reject cross-origin browser requests");
  const response = await mf.dispatchFetch("https://app.example/receive");
  if (response.status !== 200 || !(await response.text()).includes('id="root"'))
    throw new Error("SPA assets unavailable");
  console.log(
    "Workers runtime: public routing, owner capability boundary and SPA routing verified.",
  );
} finally {
  await mf.dispose();
}
