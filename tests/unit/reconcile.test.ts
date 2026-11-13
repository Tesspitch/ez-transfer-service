import { expect, it } from "vitest";
import { reconcileOrphans } from "../../src/worker/jobs/reconcile";
import { system } from "../helpers/system";
it("finishes each independent paginated scan once rather than restarting completed scans", async () => {
  const s = await system();
  let objects = 0,
    uploads = 0;
  try {
    s.storage.listObjects = async () => {
      objects++;
      return {
        items: [],
        nextCursor: objects === 1 ? "object-page-2" : undefined,
      };
    };
    s.storage.listUploads = async () => {
      uploads++;
      return {
        items: [],
        nextCursor: uploads < 3 ? "upload-page-" + (uploads + 1) : undefined,
      };
    };
    await reconcileOrphans(s.repo, s.storage);
    await reconcileOrphans(s.repo, s.storage);
    await reconcileOrphans(s.repo, s.storage);
    expect(objects).toBe(2);
    expect(uploads).toBe(3);
    await reconcileOrphans(s.repo, s.storage);
    expect(objects).toBe(2);
    expect(uploads).toBe(3);
  } finally {
    await s.db.close();
  }
});
