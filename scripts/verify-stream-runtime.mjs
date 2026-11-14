import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import workerd from "workerd";
import { buildWorker } from "./worker-build.mjs";
process.env.MINIFLARE_WORKERD_PATH =
  typeof workerd === "string" ? workerd : workerd.default;
const source = `import {createStorage} from './src/worker/storage/r2.ts';
export default {async fetch(request){const storage=createStorage({R2_ACCOUNT_ID:'test',R2_BUCKET:'test',R2_ACCESS_KEY_ID:'key',R2_SECRET_ACCESS_KEY:'secret'});try{await storage.putPart('file','upload',1,request.body,3);return new Response('ok');}catch{return new Response('rejected',{status:400});}}};`;
const compiled = await buildWorker({
  stdin: { contents: source, resolveDir: process.cwd() },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
let rejectUpstream = false;
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: compiled.outputFiles[0].text,
    compatibilityDate: "2026-11-13",
    compatibilityFlags: ["nodejs_compat"],
    outboundService: async (request) => {
      if (rejectUpstream)
        return new Response("upstream failed", { status: 503 });
      const bytes = new Uint8Array(await request.arrayBuffer());
      return new Response(bytes.length === 3 ? "" : "wrong size", {
        status: bytes.length === 3 ? 200 : 400,
      });
    },
  }),
);
try {
  const exact = await mf.dispatchFetch("https://test/", {
    method: "PUT",
    body: new Uint8Array([1, 2, 3]),
  });
  if (exact.status !== 200)
    throw new Error("Exact bounded proxy upload failed");
  for (const bytes of [new Uint8Array([1]), new Uint8Array([1, 2, 3, 4])]) {
    const result = await mf.dispatchFetch("https://test/", {
      method: "PUT",
      body: bytes,
    });
    if (result.status !== 400)
      throw new Error("Wrong-size proxy body accepted");
  }
  rejectUpstream = true;
  const failed = await mf.dispatchFetch("https://test/", {
    method: "PUT",
    body: new Uint8Array([1, 2, 3]),
  });
  if (failed.status !== 400)
    throw new Error("Upstream rejection was not propagated");
  console.log(
    "Workers streaming proxy: exact/oversized/truncated/upstream-failure cases verified.",
  );
} finally {
  await mf.dispose();
}
