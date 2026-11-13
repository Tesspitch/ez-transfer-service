import { afterAll, beforeAll, expect, it } from "vitest";
import { createApp } from "../../src/worker/app";
import { owner, receiver, system } from "../helpers/system";
import { UploadService } from "../../src/worker/services/uploads";
let s: Awaited<ReturnType<typeof system>>;
let app: ReturnType<typeof createApp>;
let id: string;
let code: string;
const req = (path: string, method = "GET", body?: unknown, user = owner) =>
  app.request(
    "https://app.example/api" + path,
    {
      method,
      headers: {
        Authorization: `Bearer ${user}`,
        ...(body instanceof Uint8Array
          ? {}
          : { "Content-Type": "application/json" }),
        "Idempotency-Key": "33333333-3333-4333-8333-333333333333",
      },
      body:
        body === undefined
          ? undefined
          : body instanceof Uint8Array
            ? new Uint8Array(body).buffer
            : JSON.stringify(body),
    },
    s.env,
  );
beforeAll(async () => {
  s = await system();
  app = createApp({
    repo: s.repo,
    storage: s.storage,
    verify: async (token) => token,
  });
});
afterAll(async () => {
  await s?.db.close();
});
it("requires auth even for unknown API routes and does not return SPA", async () => {
  expect(
    (await app.request("https://app.example/api/unknown", {}, s.env)).status,
  ).toBe(401);
  expect((await req("/unknown")).status).toBe(404);
});
it("uploads, deduplicates create, issues code only after complete", async () => {
  const body = { name: "เอกสาร.txt", sizeBytes: 3, retention: "forever" };
  const created = await req("/transfers", "POST", body);
  expect(created.status).toBe(201);
  const data = await created.json();
  id = data.id;
  expect(data.mode).toBe("proxy");
  expect(data.code).toBeUndefined();
  expect((await (await req("/transfers", "POST", body)).json()).id).toBe(id);
  expect(s.uploads.size).toBe(1);
  expect(
    (await req(`/transfers/${id}/part/1`, "PUT", new Uint8Array([1, 2, 3])))
      .status,
  ).toBe(204);
  const done = await req(`/transfers/${id}/complete`, "POST", {});
  expect(done.status).toBe(200);
  const ready = await done.json();
  code = ready.code;
  expect(ready.expiresAt).toBeNull();
  expect(
    (await (await req(`/transfers/${id}/complete`, "POST", {})).json()).code,
  ).toBe(code);
});
it("recovers a ready transaction whose database response was lost without deleting the file", async () => {
  const row = await s.repo.call<{ id: string; object_key: string }>("reserve", {
    userId: owner,
    key: crypto.randomUUID(),
    name: "lost.txt",
    sizeBytes: 1,
    retention: "24h",
  });
  const u = await s.storage.create(row.object_key);
  await s.repo.call("activate", {
    id: row.id,
    generation: 1,
    uploadId: u.uploadId,
  });
  await s.storage.putPart(
    row.object_key,
    u.uploadId,
    1,
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([5]));
        c.close();
      },
    }),
    1,
  );
  const repo = {
    async call<T>(action: string, p: Record<string, unknown> = {}) {
      const r = await s.repo.call<T>(action, p);
      if (action === "ready") throw new Error("response lost");
      return r;
    },
  };
  const service = new UploadService(repo, s.storage, s.env);
  const ready = await service.complete(
    { userId: owner, role: "member" },
    row.id,
  );
  expect(ready.code).toHaveLength(26);
  expect(
    (
      await s.repo.call<{ state: string }>("owned", {
        id: row.id,
        userId: owner,
      })
    ).state,
  ).toBe("ready");
});
it("requires code for another member and hides owner files", async () => {
  expect(
    (await req(`/transfers/${id}/download`, "POST", {}, receiver)).status,
  ).toBe(404);
  expect(
    (await req(`/transfers/${id}`, "DELETE", undefined, receiver)).status,
  ).toBe(404);
  expect(
    (await (await req("/transfers", "GET", undefined, receiver)).json()).items,
  ).toHaveLength(0);
  const resolved = await req("/transfers/resolve", "POST", { code }, receiver);
  expect(resolved.status).toBe(200);
  expect((await resolved.json()).name).toBe("เอกสาร.txt");
  const download = await req(
    `/transfers/${id}/download`,
    "POST",
    { code },
    receiver,
  );
  expect(download.status).toBe(200);
  expect((await download.json()).url).toContain("expires=300");
});
it("checks membership on every call and fails closed on body overflow", async () => {
  await s.db.exec(
    `update tt.members set active=false where user_id='${receiver}'`,
  );
  expect(
    (await req("/transfers/resolve", "POST", { code }, receiver)).status,
  ).toBe(403);
  const overflow = await req("/transfers/resolve", "POST", {
    code: "a".repeat(20000),
  });
  expect(overflow.status).toBe(413);
});
it("expiry closes resolution before cleanup, deletion keeps quota pending", async () => {
  await s.db.exec(
    `update tt.transfers set expires_at=now()-interval '1 second' where id='${id}'`,
  );
  expect((await req("/transfers/resolve", "POST", { code })).status).toBe(404);
  expect(
    (await req(`/transfers/${id}`, "PATCH", { retention: "forever" })).status,
  ).toBe(404);
  expect((await req(`/transfers/${id}`, "DELETE")).status).toBe(202);
  expect(
    (await s.repo.call<{ stored_bytes: number }>("budget")).stored_bytes,
  ).toBe(4);
});
