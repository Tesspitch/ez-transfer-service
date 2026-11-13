import { Hono } from "hono";
import { z, ZodError } from "zod";
import {
  createTransferSchema,
  partsSchema,
  retentionSchema,
  codeSchema,
  type AccessProof,
} from "../shared/contracts";
import type { Env } from "./env";
import type { Repository } from "./db";
import type { Storage } from "./storage/r2";
import { AppError } from "./errors";
import { isAllowedOrigin } from "./security/origin";
import { hashCapability } from "./security/capabilities";
import { rateKey } from "./security/rate-limit";
import { UploadService } from "./services/uploads";
import { TransferService } from "./services/transfers";
export interface Dependencies {
  repo: Repository;
  storage: Storage;
}
async function json(request: Request): Promise<unknown> {
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new AppError("BODY_TOO_LARGE", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError("INVALID");
  }
}
export function createApp(deps: Dependencies) {
  const app = new Hono<{
    Bindings: Env;
    Variables: { requestId: string; rateKey: string };
  }>();
  const owner = async (request: Request) => ({
    ownerHash: await hashCapability(
      request.headers.get("X-Transfer-Owner-Token") ?? undefined,
      "owner",
    ),
  });
  const access = async (request: Request): Promise<AccessProof> => {
    if (request.headers.has("X-Transfer-Owner-Token")) return owner(request);
    const token = request.headers.get("X-Transfer-Receiver-Token");
    return token
      ? { receiverHash: await hashCapability(token, "receiver") }
      : {};
  };
  const id = (value: string) => z.uuid().parse(value);
  const upload = (env: Env) => new UploadService(deps.repo, deps.storage, env);
  const transfers = (env: Env) =>
    new TransferService(
      deps.repo,
      deps.storage,
      JSON.parse(env.SHARE_CODE_KEYS),
    );
  app.use("*", async (c, next) => {
    c.set("requestId", crypto.randomUUID());
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Request-ID", c.get("requestId"));
    if (c.req.path.startsWith("/api")) c.header("Cache-Control", "no-store");
  });
  app.use("/api/*", async (c, next) => {
    if (
      !["GET", "HEAD"].includes(c.req.method) &&
      !isAllowedOrigin(c.req.raw, c.env.APP_ORIGIN)
    )
      throw new AppError("FORBIDDEN", 403);
    const keys = JSON.parse(c.env.SHARE_CODE_KEYS) as Record<string, string>;
    const active = keys[c.env.SHARE_CODE_ACTIVE_KEY];
    if (!c.env.RATE_KEY_SECRET && !active)
      throw new Error("RATE_KEY_UNAVAILABLE");
    const key = await rateKey(
      c.req.raw,
      c.env.RATE_KEY_SECRET ?? `transfer-rate-v2:${active}`,
    );
    c.set("rateKey", key);
    await deps.repo.call("rate", { rateKey: key, action: "api" });
    await next();
  });
  app.post("/api/transfers", async (c) => {
    await deps.repo.call("rate", {
      rateKey: c.get("rateKey"),
      action: "create",
    });
    const proof = await owner(c.req.raw);
    const raw = await json(c.req.raw);
    if (
      typeof raw === "object" &&
      raw &&
      "sizeBytes" in raw &&
      typeof raw.sizeBytes === "number" &&
      raw.sizeBytes > 1073741824
    )
      throw new AppError("FILE_TOO_LARGE", 413);
    return c.json(
      await upload(c.env).create(
        proof,
        createTransferSchema.strict().parse(raw),
        z.uuid().parse(c.req.header("Idempotency-Key")),
        c.get("rateKey"),
      ),
      201,
    );
  });
  app.post("/api/transfers/resolve", async (c) => {
    await deps.repo.call("rate", {
      rateKey: c.get("rateKey"),
      action: "receive",
    });
    return c.json(
      await transfers(c.env).resolve(
        await access(c.req.raw),
        codeSchema.parse(await json(c.req.raw)).code,
      ),
    );
  });
  app.get("/api/transfers/:id", async (c) =>
    c.json(
      await transfers(c.env).owned(
        await owner(c.req.raw),
        id(c.req.param("id")),
      ),
    ),
  );
  app.post("/api/transfers/:id/parts", async (c) =>
    c.json({
      parts: await upload(c.env).signParts(
        await owner(c.req.raw),
        id(c.req.param("id")),
        partsSchema.parse(await json(c.req.raw)).partNumbers,
      ),
    }),
  );
  app.put("/api/transfers/:id/part/:part", async (c) => {
    await upload(c.env).putPart(
      await owner(c.req.raw),
      id(c.req.param("id")),
      z.coerce.number().int().min(1).max(64).parse(c.req.param("part")),
      c.req.raw.body,
    );
    return c.body(null, 204);
  });
  app.post("/api/transfers/:id/complete", async (c) =>
    c.json(
      await upload(c.env).complete(
        await owner(c.req.raw),
        id(c.req.param("id")),
      ),
    ),
  );
  app.post("/api/transfers/:id/code", async (c) =>
    c.json(
      await transfers(c.env).code(
        await owner(c.req.raw),
        id(c.req.param("id")),
      ),
    ),
  );
  app.post("/api/transfers/:id/claim", async (c) => {
    await deps.repo.call("rate", {
      rateKey: c.get("rateKey"),
      action: "receive",
    });
    const body = z
      .object({ code: z.string().max(64), claimRequestId: z.uuid() })
      .parse(await json(c.req.raw));
    return c.json(
      await transfers(c.env).claim(
        await hashCapability(
          c.req.header("X-Transfer-Receiver-Token"),
          "receiver",
        ),
        id(c.req.param("id")),
        body.code,
        body.claimRequestId,
      ),
    );
  });
  app.post("/api/transfers/:id/download", async (c) => {
    const body = z
      .object({ code: z.string().max(64).optional() })
      .parse(await json(c.req.raw));
    return c.json(
      await transfers(c.env).download(
        await access(c.req.raw),
        id(c.req.param("id")),
        body.code,
      ),
    );
  });
  app.patch("/api/transfers/:id", async (c) =>
    c.json(
      await transfers(c.env).changeRetention(
        await owner(c.req.raw),
        id(c.req.param("id")),
        retentionSchema.parse(await json(c.req.raw)).retention,
      ),
    ),
  );
  app.delete("/api/transfers/:id", async (c) =>
    c.json(
      await transfers(c.env).delete(
        await owner(c.req.raw),
        id(c.req.param("id")),
      ),
      202,
    ),
  );
  app.all("/api/*", (c) =>
    c.json(
      {
        error: { code: "NOT_FOUND", message: "ไม่พบรายการ" },
        requestId: c.get("requestId"),
      },
      404,
    ),
  );
  app.all("*", async (c) => {
    const r = await c.env.ASSETS.fetch(c.req.raw);
    const h = new Headers(r.headers);
    h.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
    );
    return new Response(r.body, { status: r.status, headers: h });
  });
  app.onError((error, c) => {
    const e =
      error instanceof AppError
        ? error
        : error instanceof ZodError
          ? new AppError("INVALID")
          : new AppError("UNAVAILABLE", 503);
    const messages: Record<string, string> = {
      NOT_FOUND: "ไม่พบไฟล์หรือรหัสหมดอายุ",
      FORBIDDEN: "ไม่อนุญาตคำขอจากเว็บไซต์นี้",
      QUOTA: "พื้นที่ไม่เพียงพอ กรุณาลบไฟล์เดิม",
      RATE: "ใช้งานถี่เกินไป กรุณารอสักครู่",
      STATE: "สถานะไฟล์เปลี่ยนไป กรุณาลองใหม่",
      FILE_TOO_LARGE: "ไฟล์ต้องไม่เกิน 1 GiB",
      SIZE_MISMATCH: "ไฟล์อัปโหลดไม่ครบ กรุณาส่งใหม่",
      INVALID: "ข้อมูลไม่ถูกต้อง",
      BODY_TOO_LARGE: "ข้อมูลคำขอมีขนาดใหญ่เกินไป",
      FILE_ALREADY_CLAIMED: "ไฟล์นี้มีผู้รับแล้ว",
      MODE_MISMATCH: "โหมดการแชร์ไม่ตรงกับคำขอ",
    };
    return c.json(
      {
        error: {
          code: e.code,
          message: messages[e.code] ?? "ระบบยังไม่พร้อม กรุณาลองใหม่",
        },
        requestId: c.get("requestId"),
      },
      e.status as 400,
    );
  });
  return app;
}
