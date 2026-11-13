import { expect, it } from "vitest";
import { system, owner } from "../helpers/system";
import type { TransferRecord } from "../../src/shared/contracts";
it("moves accounting once, protects ready files from stale compensation, and applies retention from save time", async () => {
  const s = await system();
  try {
    let t = await s.repo.call<TransferRecord>("reserve", {
      userId: owner,
      key: crypto.randomUUID(),
      name: "a",
      sizeBytes: 9,
      retention: "24h",
    });
    await s.repo.call("activate", { id: t.id, generation: 1, uploadId: "x" });
    t = await s.repo.call("begin_finalize", { id: t.id, userId: owner });
    t = await s.repo.call("ready", {
      id: t.id,
      generation: t.lease_generation,
      hash: "hash",
      ciphertext: "encrypted",
    });
    await s.repo.call("ready", {
      id: t.id,
      generation: t.lease_generation,
      hash: "other",
      ciphertext: "different",
    });
    await s.repo.call("compensate", { id: t.id, generation: 1 });
    expect(
      (await s.repo.call<TransferRecord>("owned", { id: t.id, userId: owner }))
        .state,
    ).toBe("ready");
    const budget = await s.repo.call<{
      stored_bytes: number;
      reserved_bytes: number;
    }>("budget");
    expect(budget).toMatchObject({ stored_bytes: 9, reserved_bytes: 0 });
    expect(Date.parse(t.expires_at!) - Date.parse(t.ready_at!)).toBe(86400000);
    const forever = await s.repo.call<TransferRecord>("retention", {
      id: t.id,
      userId: owner,
      retention: "forever",
    });
    expect(forever.expires_at).toBeNull();
    const hour = await s.repo.call<TransferRecord>("retention", {
      id: t.id,
      userId: owner,
      retention: "1h",
    });
    expect(Date.parse(hour.expires_at!) - Date.now()).toBeGreaterThan(3599000);
  } finally {
    await s.db.close();
  }
});
