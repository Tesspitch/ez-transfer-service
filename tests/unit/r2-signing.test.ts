import { expect, it } from "vitest";
import { createStorage, attachment } from "../../src/worker/storage/r2";
import type { Env } from "../../src/worker/env";
it("does not sign an empty-body CRC checksum for nonempty upload parts", async () => {
  const env = {
    R2_ACCOUNT_ID: "test",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET: "bucket",
  } as Env;
  const url = new URL(
    await createStorage(env).signPart({
      key: "a",
      uploadId: "x",
      partNumber: 1,
      sizeBytes: 3,
      ttlSeconds: 60,
    }),
  );
  expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
  expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain(
    "content-length",
  );
});
it("forces attachment and escapes UTF8 and control characters", () => {
  const header = attachment('ไทย\r\n".html');
  expect(header).not.toContain("\r");
  expect(header).not.toContain("\n");
  expect(header).toContain("attachment;");
  expect(header).toContain("%E0%B9%84");
});
