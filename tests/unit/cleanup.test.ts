import { expect, it, vi } from "vitest";
import { system, owner } from "../helpers/system";
import { runCleanup } from "../../src/worker/jobs/cleanup";
it("deletes bytes before releasing quota and tolerates duplicate cleanup", async () => {
  const s = await system();
  try {
    const row = await s.repo.call<{ id: string; object_key: string }>(
      "reserve",
      {
        userId: owner,
        key: crypto.randomUUID(),
        name: "a",
        sizeBytes: 3,
        retention: "forever",
      },
    );
    await s.repo.call("activate", {
      id: row.id,
      generation: 1,
      uploadId: "id",
    });
    s.objects.set(row.object_key, new Uint8Array([1, 2, 3]));
    await s.repo.call("delete", { id: row.id, userId: owner });
    const original = s.storage.delete;
    s.storage.delete = vi.fn().mockRejectedValueOnce(new Error("network"));
    expect((await runCleanup(s.repo, s.storage)).retried).toBe(1);
    expect(
      (await s.repo.call<{ reserved_bytes: number }>("budget")).reserved_bytes,
    ).toBe(3);
    s.storage.delete = original;
    await s.db.exec(
      "update tt.cleanup_jobs set next_attempt_at=now()-interval '1 second',lease_until=null",
    );
    expect((await runCleanup(s.repo, s.storage)).deleted).toBe(1);
    expect(s.objects.size).toBe(0);
    expect(
      (await s.repo.call<{ reserved_bytes: number }>("budget")).reserved_bytes,
    ).toBe(0);
    await runCleanup(s.repo, s.storage);
    expect(
      (await s.repo.call<{ reserved_bytes: number }>("budget")).reserved_bytes,
    ).toBe(0);
  } finally {
    await s.db.close();
  }
});
