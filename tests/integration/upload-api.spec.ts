import { it, expect } from "vitest";
import { createHash } from "node:crypto";
it("transfers 1 GiB between two real staging members and verifies the downloaded SHA256", async () => {
  const names = [
    "STAGING_APP_URL",
    "STAGING_SUPABASE_URL",
    "STAGING_SUPABASE_PUBLISHABLE_KEY",
    "STAGING_OWNER_EMAIL",
    "STAGING_OWNER_PASSWORD",
    "STAGING_RECEIVER_EMAIL",
    "STAGING_RECEIVER_PASSWORD",
  ];
  for (const n of names)
    if (!process.env[n])
      throw new Error(
        `BLOCKED: missing ${n}. Full staging transfer not performed.`,
      );
  if (process.env.STAGING_ALLOW_LARGE_TEST !== "true")
    throw new Error(
      "BLOCKED: set STAGING_ALLOW_LARGE_TEST=true to authorize the 1 GiB staging fixture",
    );
  const origin = process.env.STAGING_APP_URL!;
  if (
    !origin.startsWith("https://") ||
    !new URL(origin).hostname.includes("staging")
  )
    throw new Error("Use a dedicated HTTPS staging app");
  async function login(email: string, password: string) {
    const r = await fetch(
      process.env.STAGING_SUPABASE_URL + "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        headers: {
          apikey: process.env.STAGING_SUPABASE_PUBLISHABLE_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      },
    );
    if (!r.ok) throw new Error("Staging login failed");
    return (await r.json()).access_token as string;
  }
  const owner = await login(
    process.env.STAGING_OWNER_EMAIL!,
    process.env.STAGING_OWNER_PASSWORD!,
  );
  const receiver = await login(
    process.env.STAGING_RECEIVER_EMAIL!,
    process.env.STAGING_RECEIVER_PASSWORD!,
  );
  async function api(
    path: string,
    token: string,
    method: string,
    body?: unknown,
  ) {
    const r = await fetch(origin + "/api" + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Staging API failed (${r.status})`);
    return r.json();
  }
  let id: string | undefined;
  try {
    const session = await api("/transfers", owner, "POST", {
      name: "staging-1gib.bin",
      sizeBytes: 1073741824,
      retention: "1h",
    });
    id = session.id;
    const sourceHash = createHash("sha256");
    const chunk = new Uint8Array(16777216).fill(7);
    for (let start = 1; start <= 64; start += 3) {
      const numbers = Array.from(
        { length: Math.min(3, 65 - start) },
        (_, i) => start + i,
      );
      const { parts } = await api(`/transfers/${id}/parts`, owner, "POST", {
        partNumbers: numbers,
      });
      await Promise.all(
        parts.map(async (p: { url: string; mode: string }) => {
          const r = await fetch(new URL(p.url, origin), {
            method: "PUT",
            headers:
              p.mode === "proxy" ? { Authorization: `Bearer ${owner}` } : {},
            body: chunk,
          });
          if (!r.ok)
            throw new Error(`Staging part upload failed (${r.status})`);
        }),
      );
      for (let i=0;i<numbers.length;i++) sourceHash.update(chunk);
    }
    const ready = await api(`/transfers/${id}/complete`, owner, "POST", {});
    const resolved = await api("/transfers/resolve", receiver, "POST", {
      code: ready.code,
    });
    expect(resolved.sizeBytes).toBe(1073741824);
    const signed = await api(`/transfers/${id}/download`, receiver, "POST", {
      code: ready.code,
    });
    const r = await fetch(signed.url);
    expect(r.ok).toBe(true);
    const hash = createHash("sha256");
    let count = 0;
    for await (const part of r.body!) {
      hash.update(part);
      count += part.length;
    }
    expect(count).toBe(1073741824);
    expect(hash.digest("hex")).toBe(sourceHash.digest("hex"));
  } finally {
    if (id) await api(`/transfers/${id}`, owner, "DELETE");
  }
}, 600000);
