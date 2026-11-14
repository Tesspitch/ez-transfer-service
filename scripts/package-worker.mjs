import { buildWorker } from "./worker-build.mjs";
import { existsSync } from "node:fs";
import { loadAndParseConfig } from "@cloudflare/config";
import {
  cleanBuildOutputDir,
  getWorkerBundleDir,
  writeRootConfig,
  writeWorkerConfig,
  writeAssets,
  readBuildOutput,
} from "@cloudflare/build-output-utils";
import path from "node:path";
const root = process.cwd();
// Shell/CI variables take precedence; local deployments also read .env.
if (existsSync(".env")) process.loadEnvFile(".env");
const mode = process.env.TRANSFER_MODE ?? "production";
const context = { isPreview: false, mode };
const { result } = await loadAndParseConfig(
  path.join(root, "cloudflare.config.ts"),
  context,
);
if (!result.success) throw result.error;
// Only generated output under this workspace is cleaned by the official utility.
if (
  path.resolve(root, ".cloudflare/output") !==
  path.join(root, ".cloudflare", "output")
)
  throw new Error("UNSAFE_OUTPUT_PATH");
await cleanBuildOutputDir(root);
await buildWorker({
  entryPoints: ["src/worker/index.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  outfile: path.join(getWorkerBundleDir(root), "index.js"),
});
await writeRootConfig(root, {}, context);
await writeWorkerConfig({
  root,
  config: result.data.worker,
  manifest: {
    type: "complete",
    mainModule: "index.js",
    modules: { "index.js": { type: "esm" } },
  },
});
await writeAssets({ root, sourceDirectory: path.join(root, "dist/client") });
await readBuildOutput(root);
console.log(`Cloudflare build output verified (${mode}).`);
