import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
let db: PGlite;
async function rpc(action: string, p: Record<string, unknown> = {}) {
  const result = await db.query<{ result: unknown }>(
    "select public.transfer_rpc($1,$2::jsonb) as result",
    [action, JSON.stringify(p)],
  );
  return result.rows[0].result as Record<string, unknown>;
}
const user = "11111111-1111-4111-8111-111111111111";
describe("PostgreSQL invariants", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      "create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('11111111-1111-4111-8111-111111111111');",
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/202611130001_transfer_core.sql",
        "utf8",
      ),
    );
    await db.exec(
      `insert into tt.members(user_id,role) values ('${user}','admin')`,
    );
  });
  afterAll(async () => {
    await db?.close();
  });
  it("restricts RPC to service role", async () => {
    await db.exec("set role anon");
    await expect(rpc("member", { userId: user })).rejects.toThrow(
      /permission denied/,
    );
    await db.exec("reset role");
  });
  it("reserves exactly 8 GiB, deduplicates retries, rejects conflicting keys", async () => {
    const requests = Array.from({ length: 8 }, () => ({
      userId: user,
      name: "ไทย.zip",
      sizeBytes: 1073741824,
      retention: "24h",
      key: crypto.randomUUID(),
    }));
    const rows = await Promise.all(requests.map((p) => rpc("reserve", p)));
    expect(rows).toHaveLength(8);
    expect((await rpc("reserve", requests[0])).id).toBe(rows[0].id);
    await expect(
      rpc("reserve", { ...requests[0], name: "other" }),
    ).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
    await expect(
      rpc("reserve", { ...requests[0], key: crypto.randomUUID() }),
    ).rejects.toThrow(/QUOTA/);
    const budget = await rpc("budget");
    expect(budget.reserved_bytes).toBe(8589934592);
    expect(budget.stored_bytes).toBe(0);
  });
  it("fences stale activation, delete retries do not release reservations prematurely", async () => {
    const row = (
      await db.query<{ id: string }>(
        "select id from tt.transfers order by id limit 1",
      )
    ).rows[0];
    await rpc("delete", { userId: user, id: row.id });
    await expect(
      rpc("activate", { id: row.id, generation: 1, uploadId: "late" }),
    ).rejects.toThrow(/STATE/);
    await rpc("delete", { userId: user, id: row.id });
    expect((await rpc("budget")).reserved_bytes).toBe(8589934592);
  });
  it("enforces shared rate counters and membership suspension", async () => {
    for (let i = 0; i < 30; i++)
      await rpc("rate", { userId: user, action: "receive" });
    await expect(
      rpc("rate", { userId: user, action: "receive" }),
    ).rejects.toThrow(/RATE/);
    await db.exec(`update tt.members set active=false where user_id='${user}'`);
    await expect(
      rpc("reserve", {
        userId: user,
        key: crypto.randomUUID(),
        name: "a",
        sizeBytes: 1,
        retention: "forever",
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
