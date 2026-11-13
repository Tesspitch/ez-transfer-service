import { expect, it } from "vitest";
import {
  generateCode,
  normalizeCode,
  hashCode,
  encryptCode,
  decryptCode,
} from "../../src/worker/security/share-code";
it("normalizes 128-bit codes and hashes deterministically", async () => {
  const code = generateCode();
  expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(
    normalizeCode(
      code
        .toLowerCase()
        .match(/.{1,5}/g)!
        .join("-"),
    ),
  ).toBe(code);
  expect(await hashCode(code)).toHaveLength(64);
  expect(generateCode()).not.toBe(code);
});
it("encrypts owner recovery with key version, rejects tampered ciphertext", async () => {
  const keys = { v1: btoa("a".repeat(32)) };
  const code = generateCode();
  const encrypted = await encryptCode(code, "v1", keys);
  expect(encrypted).not.toContain(code);
  expect(await decryptCode(encrypted, keys)).toBe(code);
  await expect(
    decryptCode(encrypted.slice(0, -5) + "AAAAA", keys),
  ).rejects.toThrow();
});
