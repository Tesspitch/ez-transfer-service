import { it, expect } from "vitest";
import { createHash, randomBytes } from "node:crypto";
it("transfers 1 GiB anonymously through staging and verifies downloaded SHA256", async () => {
  if (!process.env.STAGING_APP_URL)
    throw new Error(
      "BLOCKED: missing STAGING_APP_URL; no live app verification performed",
    );
  if (process.env.STAGING_ALLOW_LARGE_TEST !== "true")
    throw new Error(
      "BLOCKED: authorize 1 GiB staging fixture with STAGING_ALLOW_LARGE_TEST=true",
    );
  const origin = process.env.STAGING_APP_URL;
  if (
    !origin.startsWith("https://") ||
    !new URL(origin).hostname.includes("staging")
  )
    throw new Error("Use a dedicated HTTPS staging app");
  const owner = randomBytes(32).toString("base64url");
  let id: string | undefined;
  async function api(
    path: string,
    method: string,
    body?: unknown,
    own = false,
  ) {
    const response = await fetch(origin + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        ...(own ? { "X-Transfer-Owner-Token": owner } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(`Staging API failed (${response.status})`);
    return response.json();
  }
  try {
    const session = await api(
      "/transfers",
      "POST",
      {
        name: "staging-1gib.bin",
        sizeBytes: 1073741824,
        retention: "1h",
        shareMode: "multiple",
      },
      true,
    );
    id = session.id;
    const hash = createHash("sha256");
    const bytes = new Uint8Array(16777216).fill(7);
    for (let start = 1; start <= 64; start += 3) {
      const numbers = Array.from(
        { length: Math.min(3, 65 - start) },
        (_, i) => start + i,
      );
      const { parts } = await api(
        `/transfers/${id}/parts`,
        "POST",
        { partNumbers: numbers },
        true,
      );
      await Promise.all(
        parts.map(async (p: { url: string; mode: string }) => {
          const r = await fetch(new URL(p.url, origin), {
            method: "PUT",
            headers:
              p.mode === "proxy" ? { "X-Transfer-Owner-Token": owner } : {},
            body: bytes,
          });
          if (!r.ok) throw new Error("Part upload failed");
        }),
      );
      for (let i = 0; i < numbers.length; i++) hash.update(bytes);
    }
    const ready = await api(`/transfers/${id}/complete`, "POST", {}, true);
    for (let receiver = 0; receiver < 2; receiver++) {
      const resolved = await api("/transfers/resolve", "POST", {
        code: ready.code,
      });
      expect(resolved.sizeBytes).toBe(1073741824);
    }
    const signed = await api(`/transfers/${id}/download`, "POST", {
      code: ready.code,
    });
    const r = await fetch(signed.url);
    expect(r.ok).toBe(true);
    const actual = createHash("sha256");
    let count = 0;
    for await (const part of r.body!) {
      actual.update(part);
      count += part.length;
    }
    expect(count).toBe(1073741824);
    expect(actual.digest("hex")).toBe(hash.digest("hex"));
  } finally {
    if (id) await api(`/transfers/${id}`, "DELETE", undefined, true);
  }
}, 600000);
