import type { Repository } from "../db";
import type { Storage } from "../storage/r2";
import type { TransferRecord } from "../../shared/contracts";
export async function reconcileOrphans(repo: Repository, storage: Storage) {
  const checkpoint = await repo.call<{
    objects?: string;
    uploads?: string;
    objectsDone?: boolean;
    uploadsDone?: boolean;
    lastCompleted?: string;
  }>("maintenance_get", { key: "scan" });
  if (
    !checkpoint.objects &&
    !checkpoint.uploads &&
    checkpoint.lastCompleted &&
    Date.now() - Date.parse(checkpoint.lastCompleted) < 86400000
  )
    return;
  const grace = Date.now() - 86400000;
  if (checkpoint.lastCompleted) {
    checkpoint.objectsDone = false;
    checkpoint.uploadsDone = false;
  }
  const objects = checkpoint.objectsDone
    ? { items: [], nextCursor: undefined }
    : await storage.listObjects(checkpoint.objects);
  for (const o of objects.items) {
    if (Date.parse(o.createdAt) > grace) continue;
    const row = await repo.call<TransferRecord | null>("by_key", {
      key: o.key,
    });
    if (!row || row.state === "deleted") await storage.delete(o.key);
  }
  const uploads = checkpoint.uploadsDone
    ? { items: [], nextCursor: undefined }
    : await storage.listUploads("transfers/", checkpoint.uploads);
  for (const u of uploads.items) {
    if (Date.parse(u.initiatedAt) > grace) continue;
    const row = await repo.call<TransferRecord | null>("by_key", {
      key: u.key,
    });
    if (!row || ["deleted", "deleting"].includes(row.state))
      await storage.abort(u.key, u.uploadId);
  }
  await repo.call("maintenance", {
    key: "scan",
    value: {
      objects: objects.nextCursor,
      uploads: uploads.nextCursor,
      objectsDone: !objects.nextCursor,
      uploadsDone: !uploads.nextCursor,
      lastCompleted:
        !objects.nextCursor && !uploads.nextCursor
          ? new Date().toISOString()
          : undefined,
    },
  });
  await repo.call("gc");
}
