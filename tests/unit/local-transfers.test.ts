import { it, expect, vi } from "vitest";
import {
  rememberTransfer,
  localTransfers,
  rememberClaim,
  receiverClaim,
  receiverForCode,
} from "../../src/web/lib/local-transfers";
it("keeps owner and receiver capabilities in memory when storage reads and writes fail", () => {
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  });
  vi.stubGlobal("sessionStorage", {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  });
  rememberTransfer({
    id: "memory-test",
    ownerToken: "secret",
    createdAt: "now",
  });
  expect(localTransfers().some((t) => t.id === "memory-test")).toBe(true);
  rememberClaim({
    transferId: "memory-test",
    canonicalCode: "code",
    receiverToken: "receiver",
    claimRequestId: "request",
    state: "pending",
  });
  expect(receiverClaim()?.receiverToken).toBe("receiver");
  vi.unstubAllGlobals();
});
it("restores an earlier receiver proof after receiving a second file in the same tab", () => {
  rememberClaim({
    transferId: "first",
    canonicalCode: "01234-56789",
    receiverToken: "first-proof",
    claimRequestId: "first-request",
    state: "confirmed",
  });
  rememberClaim({
    transferId: "second",
    canonicalCode: "22222",
    receiverToken: "second-proof",
    claimRequestId: "second-request",
    state: "confirmed",
  });
  expect(receiverForCode("0123456789")?.receiverToken).toBe("first-proof");
});
