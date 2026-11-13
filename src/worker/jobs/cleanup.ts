import type { Repository } from "../db";
import type { Storage } from "../storage/r2";
import type { TransferRecord } from "../../shared/contracts";
export async function runCleanup(repo: Repository, storage: Storage) {
  const jobs = await repo.call<TransferRecord[]>("due");
  let deleted = 0,
    retried = 0;
  for (const t of jobs) {
    try {
      let cursor: string | undefined;
      do {
        const page = await storage.listUploads(t.object_key, cursor);
        for (const u of page.items)
          if (u.key === t.object_key) await storage.abort(u.key, u.uploadId);
        cursor = page.nextCursor;
      } while (cursor);
      if (t.upload_id) await storage.abort(t.object_key, t.upload_id);
      await storage.delete(t.object_key);
      if (await storage.head(t.object_key)) throw new Error("OBJECT_REMAINS");
      await repo.call("cleaned", { id: t.id, generation: t.lease_generation });
      deleted++;
    } catch {
      retried++;
      await repo
        .call("retry_cleanup", { id: t.id, generation: t.lease_generation })
        .catch(() => {});
    }
  }
  return { claimed: jobs.length, deleted, retried };
}
