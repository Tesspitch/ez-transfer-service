import { expect, it } from "vitest";
import {
  uploadFile,
  type UploadTransport,
} from "../../src/web/features/send/multipart-client";
it("retries failed chunks at most three times and never completes a failed upload", async () => {
  let attempts = 0,
    complete = 0,
    cancel = 0;
  const transport: UploadTransport = {
    async create() {
      return {
        id: "x",
        state: "uploading",
        partSizeBytes: 4,
        partCount: 1,
        uploadDeadline: new Date(Date.now() + 60000).toISOString(),
        mode: "proxy",
      };
    },
    async parts() {
      return [
        {
          partNumber: 1,
          url: "/part",
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          mode: "proxy",
        },
      ];
    },
    async put() {
      attempts++;
      throw new Error("network");
    },
    async complete() {
      complete++;
      throw new Error("not expected");
    },
    async cancel() {
      cancel++;
    },
    async sleep() {},
  };
  await expect(
    uploadFile(new File(["data"], "x"), "24h", {
      signal: new AbortController().signal,
      onProgress: () => {},
      transport,
    }),
  ).rejects.toThrow();
  expect(attempts).toBe(4);
  expect(complete).toBe(0);
  expect(cancel).toBe(1);
});
it("limits concurrency and completion follows every successful part", async () => {
  let active = 0,
    max = 0,
    parts = 0;
  const transport: UploadTransport = {
    async create() {
      return {
        id: "x",
        state: "uploading",
        partSizeBytes: 1,
        partCount: 7,
        uploadDeadline: new Date(Date.now() + 60000).toISOString(),
        mode: "proxy",
      };
    },
    async parts(_id, numbers) {
      return numbers.map((partNumber) => ({
        partNumber,
        url: "/part",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        mode: "proxy",
      }));
    },
    async put() {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      parts++;
    },
    async complete() {
      expect(parts).toBe(7);
      return { id: "x", code: "code", readyAt: "now", expiresAt: null };
    },
    async cancel() {},
    async sleep() {},
  };
  const progress: number[] = [];
  await uploadFile(new File(["1234567"], "x"), "forever", {
    signal: new AbortController().signal,
    onProgress: (b) => progress.push(b),
    transport,
  });
  expect(max).toBe(3);
  expect(progress.at(-1)).toBe(7);
});
it("does not delete an upload after an ambiguous completion response", async () => {
  let cancels = 0,
    completes = 0;
  const transport: UploadTransport = {
    async create() {
      return {
        id: "x",
        state: "uploading",
        partSizeBytes: 1,
        partCount: 1,
        uploadDeadline: new Date(Date.now() + 60000).toISOString(),
        mode: "proxy",
      };
    },
    async parts() {
      return [
        {
          partNumber: 1,
          url: "/part",
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          mode: "proxy",
        },
      ];
    },
    async put() {},
    async complete() {
      completes++;
      throw new Error("response lost");
    },
    async cancel() {
      cancels++;
    },
    async sleep() {},
  };
  await expect(
    uploadFile(new File(["a"], "a"), "24h", {
      signal: new AbortController().signal,
      onProgress: () => {},
      transport,
    }),
  ).rejects.toThrow();
  expect(completes).toBeGreaterThan(1);
  expect(cancels).toBe(0);
});
