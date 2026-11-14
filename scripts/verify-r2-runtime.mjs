import { buildWorker } from "./worker-build.mjs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import workerd from "workerd";
process.env.MINIFLARE_WORKERD_PATH =
  typeof workerd === "string" ? workerd : workerd.default;
const compiled = await buildWorker({
  stdin: {
    contents: `import {createStorage} from './src/worker/storage/r2.ts';
export default {async fetch(){try{const storage=createStorage({R2_ACCOUNT_ID:'test',R2_BUCKET:'test',R2_ACCESS_KEY_ID:'key',R2_SECRET_ACCESS_KEY:'secret'});const result=await storage.create('file');if(result.uploadId!=='test-upload')throw new Error('Unexpected upload ID');return new Response('ok');}catch(e){return new Response(e.message,{status:500});}}};`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: compiled.outputFiles[0].text,
    compatibilityDate: "2026-11-13",
    compatibilityFlags: ["nodejs_compat"],
    outboundService: async () =>
      new Response(
        '<?xml version="1.0"?><InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Bucket>test</Bucket><Key>file</Key><UploadId>test-upload</UploadId></InitiateMultipartUploadResult>',
        { headers: { "Content-Type": "application/xml" } },
      ),
  }),
);
try {
  const response = await mf.dispatchFetch("https://test/");
  if (response.status !== 200)
    throw new Error(
      `R2 XML response parsing failed in Workers: ${await response.text()}`,
    );
  console.log(
    "Workers runtime: R2 multipart XML response parsed without DOM APIs.",
  );
} finally {
  await mf.dispose();
}
