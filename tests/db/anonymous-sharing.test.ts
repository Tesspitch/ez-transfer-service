import { it, expect } from "vitest";
import { system } from "../helpers/system";
import type { TransferRecord } from "../../src/shared/contracts";
it("allows no-account creation and atomically awards one receiver with replay recovery", async () => {
  const s = await system(true);
  try {
    const ownerHash = "a".repeat(64);
    const key = crypto.randomUUID();
    let t = await s.repo.call<TransferRecord>("reserve", {
      ownerHash,
      key,
      name: "a",
      sizeBytes: 3,
      retention: "forever",
      shareMode: "single",
      rateKey: "ip",
    });
    expect(
      (
        await s.repo.call<TransferRecord>("reserve", {
          ownerHash,
          key,
          name: "a",
          sizeBytes: 3,
          retention: "forever",
          shareMode: "single",
          rateKey: "ip",
        })
      ).id,
    ).toBe(t.id);
    await expect(
      s.repo.call("owned", { id: t.id, ownerHash: "b".repeat(64) }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await s.repo.call("activate", { id: t.id, generation: 1, uploadId: "u" });
    t = await s.repo.call("begin_finalize", { id: t.id, ownerHash });
    t = await s.repo.call("ready", {
      id: t.id,
      generation: t.lease_generation,
      hash: "codehash",
      ciphertext: "cipher",
    });
    await s.repo.call("resolve", { hash: "codehash" });
    const requestId = crypto.randomUUID();
    const claim = {
      id: t.id,
      hash: "codehash",
      receiverHash: "c".repeat(64),
      claimRequestId: requestId,
    };
    const outcomes = await Promise.allSettled([
      s.repo.call("claim", claim),
      s.repo.call("claim", {
        ...claim,
        receiverHash: "d".repeat(64),
        claimRequestId: crypto.randomUUID(),
      }),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    await s.repo.call("claim", claim);
    await s.repo.call("download", {
      id: t.id,
      receiverHash: claim.receiverHash,
    });
    await expect(
      s.repo.call("download", { id: t.id, hash: "codehash" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      s.repo.call("resolve", { hash: "codehash" }),
    ).rejects.toMatchObject({ code: "FILE_ALREADY_CLAIMED" });
    const final = await s.repo.call<TransferRecord>("owned", {
      id: t.id,
      ownerHash,
    });
    expect(final.expires_at).toBeNull();
    expect(final.state).toBe("ready");
  } finally {
    await s.db.close();
  }
});
it("keeps multiple receivers open, rejects old data and unauthorized RPC roles", async () => {
  const s = await system(true);
  try {
    const oh = "a".repeat(64);
    let t = await s.repo.call<TransferRecord>("reserve", {
      ownerHash: oh,
      key: crypto.randomUUID(),
      name: "a",
      sizeBytes: 1,
      retention: "24h",
      shareMode: "multiple",
      rateKey: "ip",
    });
    await s.repo.call("activate", { id: t.id, generation: 1, uploadId: "u" });
    t = await s.repo.call("begin_finalize", { id: t.id, ownerHash: oh });
    await s.repo.call("ready", {
      id: t.id,
      generation: t.lease_generation,
      hash: "multi",
      ciphertext: "cipher",
    });
    await s.repo.call("download", { id: t.id, hash: "multi" });
    await s.repo.call("download", { id: t.id, hash: "multi" });
    await expect(
      s.repo.call("claim", {
        id: t.id,
        hash: "multi",
        receiverHash: "b".repeat(64),
        claimRequestId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "MODE_MISMATCH" });
    await s.db.exec(
      `insert into tt.transfers(owner_id,original_name,size_bytes,object_key,retention,state,code_hash)values('11111111-1111-4111-8111-111111111111','legacy',1,'legacy-key','forever','ready','legacy-code')`,
    );
    await expect(
      s.repo.call("resolve", { hash: "legacy-code" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await s.db.exec("set role anon");
    await expect(s.repo.call("resolve", { hash: "multi" })).rejects.toThrow();
    await s.db.exec("reset role");
  } finally {
    await s.db.close();
  }
});
