import { it, expect } from "vitest";
import { chromium } from "@playwright/test";
import { createStorage } from "../../src/worker/storage/r2";
import type { Env } from "../../src/worker/env";
it("verifies real private R2 browser multipart uploads and size enforcement (credentials required)", async () => {
  const required = [
    "R2_ACCOUNT_ID",
    "R2_BUCKET",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ];
  for (const name of required)
    if (!process.env[name])
      throw new Error(
        `BLOCKED: missing staging ${name}. No live R2 verification performed.`,
      );
  const env = Object.fromEntries(
    required.map((k) => [k, process.env[k]]),
  ) as Partial<Env> as Env;
  if (!env.R2_BUCKET.endsWith("-staging"))
    throw new Error("Live tests require a dedicated -staging bucket");
  const storage = createStorage(env);
  const key = "integration/" + crypto.randomUUID();
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage();
  let uploadId: string | undefined;
  try {
    const created = await storage.create(key);
    uploadId = created.uploadId;
    const first = await storage.signPart({
      key,
      uploadId,
      partNumber: 1,
      sizeBytes: 16777216,
      ttlSeconds: 120,
    });
    const second = await storage.signPart({
      key,
      uploadId,
      partNumber: 2,
      sizeBytes: 1,
      ttlSeconds: 120,
    });
    // Integration origin must be allowed explicitly in staging R2 CORS. No disabling browser security.
    await page.route("https://transfer-staging.example.test/", (r) =>
      r.fulfill({
        body: "<!doctype html><title>R2 integration</title>",
        contentType: "text/html",
      }),
    );
    await page.goto("https://transfer-staging.example.test/");
    const statuses = await page.evaluate(
      async ({ first, second }) => {
        const wrong = await fetch(second, {
          method: "PUT",
          body: new Uint8Array([7, 8]),
        })
          .then((r) => r.status)
          .catch(() => 0);
        const a = await fetch(first, {
          method: "PUT",
          body: new Uint8Array(16777216).fill(7),
        });
        const b = await fetch(second, {
          method: "PUT",
          body: new Uint8Array([8]),
        });
        return { wrong, a: a.status, b: b.status };
      },
      { first, second },
    );
    expect(statuses.wrong).toBeGreaterThanOrEqual(400);
    expect(statuses.a).toBe(200);
    expect(statuses.b).toBe(200);
    const parts = await storage.inspectParts(key, uploadId);
    await storage.complete(key, uploadId, parts);
    uploadId = undefined;
    expect((await storage.head(key))?.sizeBytes).toBe(16777217);
    const download = await storage.signDownload(key, "test.bin", 120);
    const response = await fetch(download);
    const data = new Uint8Array(await response.arrayBuffer());
    expect(data.length).toBe(16777217);
    expect(data[0]).toBe(7);
    expect(data.at(-1)).toBe(8);
  } finally {
    if (uploadId) await storage.abort(key, uploadId);
    await storage.delete(key);
    await browser.close();
  }
});
