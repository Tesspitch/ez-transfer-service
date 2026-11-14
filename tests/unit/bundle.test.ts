import { it, expect } from "vitest";
import { ZipReader, BlobReader, TextWriter } from "@zip.js/zip.js";
import { prepareBundle } from "../../src/web/features/send/bundle";
import { MAX_FILE_BYTES } from "../../src/shared/contracts";
it("keeps retry metadata stable and distinguishes different selections", async () => {
  const options = {
    signal: new AbortController().signal,
    onProgress: () => {},
  };
  const a = new File(["a"], "a.txt", { lastModified: 100000 });
  const b = new File(["b"], "b.txt", { lastModified: 100000 });
  const first = await prepareBundle([a, b], options);
  const retry = await prepareBundle([a, b], options);
  const different = await prepareBundle(
    [a, new File(["b"], "c.txt", { lastModified: 100000 })],
    options,
  );
  expect([first.name, first.size, first.lastModified]).toEqual([
    retry.name,
    retry.size,
    retry.lastModified,
  ]);
  expect(first.name).not.toBe(different.name);
});
it("rejects oversized totals before reading data and cancels during ZIP preparation", async () => {
  const large = new File(["a"], "large");
  Object.defineProperty(large, "size", { value: MAX_FILE_BYTES });
  await expect(
    prepareBundle([large, new File(["b"], "b")], {
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
  ).rejects.toThrow("ขนาดรวมเกิน");
  const controller = new AbortController();
  await expect(
    prepareBundle(
      [new File([new Uint8Array(1024 * 1024)], "a"), new File(["b"], "b")],
      { signal: controller.signal, onProgress: () => controller.abort() },
    ),
  ).rejects.toThrow();
});
it("preserves a single original file without ZIP wrapping", async () => {
  const file = new File(["a"], "ไทย.txt");
  expect(
    await prepareBundle([file], {
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
  ).toBe(file);
});
it("packs only provided files, preserves Thai data and safely renames duplicate archive entries", async () => {
  const result = await prepareBundle(
    [
      new File(["first"], "ไทย.txt"),
      new File(["second"], "ไทย.txt"),
      new File(["safe"], "../unsafe.txt"),
    ],
    { signal: new AbortController().signal, onProgress: () => {} },
  );
  expect(result.name.endsWith(".zip")).toBe(true);
  const reader = new ZipReader(new BlobReader(result), {
    useWebWorkers: false,
  });
  try {
    const entries = await reader.getEntries();
    expect(entries.map((e) => e.filename)).toEqual([
      "ไทย.txt",
      "ไทย (2).txt",
      "_unsafe.txt",
    ]);
    const contents = await Promise.all(
      entries.map((e) =>
        !e.directory
          ? e.getData(new TextWriter(), { useWebWorkers: false })
          : "",
      ),
    );
    expect(contents).toEqual(["first", "second", "safe"]);
  } finally {
    await reader.close();
  }
});
it("rejects an empty selection and honors cancellation before preparing", async () => {
  await expect(
    prepareBundle([], {
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
  ).rejects.toThrow();
  const c = new AbortController();
  c.abort();
  await expect(
    prepareBundle([new File(["a"], "a")], {
      signal: c.signal,
      onProgress: () => {},
    }),
  ).rejects.toThrow();
});
