import { describe, expect, it } from "vitest";
import {
  createTransferSchema,
  expiresAt,
  downloadTtl,
  partSize,
  PART_BYTES,
  MAX_FILE_BYTES,
} from "../../src/shared/contracts";
describe("file policy", () => {
  it("rejects empty and oversized files but accepts exactly 1 GiB", () => {
    expect(
      createTransferSchema.safeParse({ name: "ไทย.zip", sizeBytes: 0 }).success,
    ).toBe(false);
    expect(
      createTransferSchema.safeParse({
        name: "ไทย.zip",
        sizeBytes: MAX_FILE_BYTES + 1,
      }).success,
    ).toBe(false);
    expect(
      createTransferSchema.parse({ name: "ไทย.zip", sizeBytes: MAX_FILE_BYTES })
        .retention,
    ).toBe("24h");
  });
  it("uses exact byte counts for final parts and rejects outside indexes", () => {
    expect(partSize(PART_BYTES + 1, 2)).toBe(1);
    expect(() => partSize(1, 2)).toThrow();
  });
  it("starts retention at ready time and caps download TTL", () => {
    const now = new Date("2026-11-13T00:00:00Z");
    expect(expiresAt("24h", now)).toBe("2026-11-14T00:00:00.000Z");
    expect(expiresAt("forever", now)).toBeNull();
    expect(downloadTtl("2026-11-13T00:01:00Z", now)).toBe(60);
    expect(downloadTtl(now.toISOString(), now)).toBe(0);
    expect(downloadTtl(null, now)).toBe(300);
  });
});
