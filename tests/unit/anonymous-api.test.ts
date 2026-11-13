import { beforeAll, afterAll, it, expect } from "vitest";
import { createApp } from "../../src/worker/app";
import { system } from "../helpers/system";
import { UploadService } from "../../src/worker/services/uploads";
import { hashCapability } from "../../src/worker/security/capabilities";
let s: Awaited<ReturnType<typeof system>>;
let app: ReturnType<typeof createApp>;
let id: string;
let code: string;
const owner = "A".repeat(43),
  other = "B".repeat(43),
  first = "C".repeat(43),
  second = "D".repeat(43);
const req = (
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  app.request(
    "https://app.example/api" + path,
    {
      method,
      headers: {
        "CF-Connecting-IP": "192.0.2.1",
        "Content-Type": "application/json",
        ...headers,
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
  s = await system(true);
  app = createApp({ repo: s.repo, storage: s.storage });
});
afterAll(async () => {
  await s?.db.close();
});
it("is public without an auth session but never lists all files", async () => {
  expect((await req("/unknown")).status).toBe(404);
  expect((await req("/transfers")).status).toBe(404);
  expect((await req("/me")).status).toBe(404);
});
it("uploads and issues code using an owner secret without accounts", async () => {
  const create = await req(
    "/transfers",
    "POST",
    {
      name: "ไทย.txt",
      sizeBytes: 3,
      retention: "forever",
      shareMode: "single",
    },
    { "X-Transfer-Owner-Token": owner, "Idempotency-Key": crypto.randomUUID() },
  );
  expect(create.status).toBe(201);
  id = (await create.json()).id;
  expect(
    (await req(`/transfers/${id}/parts`, "POST", { partNumbers: [1] })).status,
  ).toBe(404);
  expect(
    (
      await req(`/transfers/${id}/part/1`, "PUT", new Uint8Array([1, 2, 3]), {
        "X-Transfer-Owner-Token": owner,
      })
    ).status,
  ).toBe(204);
  const ready = await req(
    `/transfers/${id}/complete`,
    "POST",
    {},
    { "X-Transfer-Owner-Token": owner },
  );
  expect(ready.status).toBe(200);
  code = (await ready.json()).code;
  expect(
    (
      await req(`/transfers/${id}`, "DELETE", undefined, {
        "X-Transfer-Owner-Token": other,
      })
    ).status,
  ).toBe(404);
  expect((await req(`/transfers/${id}`)).status).toBe(404);
});
it("does not consume on resolve, awards one receiver and permits download retry", async () => {
  for (let i = 0; i < 2; i++)
    expect((await req("/transfers/resolve", "POST", { code })).status).toBe(
      200,
    );
  const claimRequestId = crypto.randomUUID();
  const url = `/transfers/${id}/claim`;
  expect(
    (
      await req(
        url,
        "POST",
        { code, claimRequestId },
        { "X-Transfer-Receiver-Token": first },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await req(
        url,
        "POST",
        { code, claimRequestId },
        { "X-Transfer-Receiver-Token": first },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await req(
        url,
        "POST",
        { code, claimRequestId: crypto.randomUUID() },
        { "X-Transfer-Receiver-Token": second },
      )
    ).status,
  ).toBe(409);
  expect(
    (await req(`/transfers/${id}/download`, "POST", { code })).status,
  ).toBe(404);
  expect(
    (
      await req(
        `/transfers/${id}/download`,
        "POST",
        {},
        { "X-Transfer-Receiver-Token": first },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await req(
        `/transfers/${id}/download`,
        "POST",
        {},
        { "X-Transfer-Receiver-Token": first },
      )
    ).status,
  ).toBe(200);
  expect((await req("/transfers/resolve", "POST", { code })).status).toBe(409);
  const own = await req(`/transfers/${id}`, "GET", undefined, {
    "X-Transfer-Owner-Token": owner,
  });
  expect((await own.json()).expiresAt).toBeNull();
});
it("recovers a committed ready transaction after response loss without deleting it", async () => {
  const proof = { ownerHash: await hashCapability(owner, "owner") };
  const service = new UploadService(s.repo, s.storage, s.env);
  const session = await service.create(
    proof,
    { name: "lost.txt", sizeBytes: 1, retention: "24h", shareMode: "single" },
    crypto.randomUUID(),
    "another-ip",
  );
  await service.putPart(
    proof,
    session.id,
    1,
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([9]));
        c.close();
      },
    }),
  );
  const flaky = {
    async call<T>(action: string, p: Record<string, unknown> = {}) {
      const result = await s.repo.call<T>(action, p);
      if (action === "ready") throw new Error("lost response");
      return result;
    },
  };
  const recovered = await new UploadService(flaky, s.storage, s.env).complete(
    proof,
    session.id,
  );
  expect(recovered.code).toHaveLength(26);
  expect((await service.complete(proof, session.id)).code).toBe(recovered.code);
});
it("blocks expired codes and never revives them through retention changes", async () => {
  await s.db.exec(
    `update tt.transfers set expires_at=now()-interval '1 second' where id='${id}'`,
  );
  expect((await req("/transfers/resolve", "POST", { code })).status).toBe(404);
  expect(
    (
      await req(
        `/transfers/${id}`,
        "PATCH",
        { retention: "forever" },
        { "X-Transfer-Owner-Token": owner },
      )
    ).status,
  ).toBe(404);
});
