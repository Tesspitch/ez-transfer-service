import { Hono } from "hono";
import { z, ZodError } from "zod";
import {
  createTransferSchema,
  partsSchema,
  retentionSchema,
  codeSchema,
  type Member,
  type Budget,
} from "../shared/contracts";
import type { Env } from "./env";
import type { Repository } from "./db";
import type { Storage } from "./storage/r2";
import { requireMember } from "./auth";
import { AppError } from "./errors";
import { UploadService } from "./services/uploads";
import { TransferService } from "./services/transfers";
export interface Dependencies {
  repo: Repository;
  storage: Storage;
  verify: (token: string) => Promise<string>;
}
async function json(request: Request): Promise<unknown> {
  if (!request.body) return {};
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
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
  let offset = 0;
  for (const b of chunks) {
    bytes.set(b, offset);
    offset += b.length;
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
    Variables: { member: Member; requestId: string };
  }>();
  app.use("*", async (c, next) => {
    c.set("requestId", crypto.randomUUID());
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Request-ID", c.get("requestId"));
    if (c.req.path.startsWith("/api")) c.header("Cache-Control", "no-store");
  });
  app.use("/api/*", async (c, next) => {
    if (!["GET", "HEAD"].includes(c.req.method)) {
      const origin = c.req.header("Origin");
      if (origin && origin !== c.env.APP_ORIGIN)
        throw new AppError("FORBIDDEN", 403);
    }
    const member = await requireMember(c.req.raw, deps.verify, (id) =>
      deps.repo.call<Member>("member", { userId: id }),
    );
    c.set("member", member);
    await deps.repo.call("rate", { userId: member.userId, action: "api" });
    await next();
  });
  const upload = (env: Env) => new UploadService(deps.repo, deps.storage, env);
  const transfers = (env: Env) =>
    new TransferService(
      deps.repo,
      deps.storage,
      JSON.parse(env.SHARE_CODE_KEYS),
    );
  const id = (value: string) => z.uuid().parse(value);
  app.get("/api/me", async (c) =>
    c.json({
      user: c.get("member"),
      budget: await deps.repo.call<Budget>("budget"),
    }),
  );
  app.post("/api/transfers", async (c) => {
    await deps.repo.call("rate", {
      userId: c.get("member").userId,
      action: "create",
    });
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
        c.get("member"),
        createTransferSchema.parse(raw),
        z.uuid().parse(c.req.header("Idempotency-Key")),
      ),
      201,
    );
  });
  app.get("/api/transfers", async (c) =>
    c.json(await transfers(c.env).list(c.get("member"), c.req.query("cursor"))),
  );
  app.post("/api/transfers/resolve", async (c) => {
    await deps.repo.call("rate", {
      userId: c.get("member").userId,
      action: "receive",
    });
    return c.json(
      await transfers(c.env).resolve(
        c.get("member"),
        codeSchema.parse(await json(c.req.raw)).code,
      ),
    );
  });
  app.get("/api/transfers/:id", async (c) =>
    c.json(
      await transfers(c.env).owned(c.get("member"), id(c.req.param("id"))),
    ),
  );
  app.post("/api/transfers/:id/parts", async (c) =>
    c.json({
      parts: await upload(c.env).signParts(
        c.get("member"),
        id(c.req.param("id")),
        partsSchema.parse(await json(c.req.raw)).partNumbers,
      ),
    }),
  );
  app.put("/api/transfers/:id/part/:part", async (c) => {
    await upload(c.env).putPart(
      c.get("member"),
      id(c.req.param("id")),
      z.coerce.number().int().min(1).max(64).parse(c.req.param("part")),
      c.req.raw.body,
    );
    return c.body(null, 204);
  });
  app.post("/api/transfers/:id/complete", async (c) =>
    c.json(
      await upload(c.env).complete(c.get("member"), id(c.req.param("id"))),
    ),
  );
  app.post("/api/transfers/:id/code", async (c) =>
    c.json(await transfers(c.env).code(c.get("member"), id(c.req.param("id")))),
  );
  app.post("/api/transfers/:id/download", async (c) => {
    await deps.repo.call("rate", {
      userId: c.get("member").userId,
      action: "receive",
    });
    const data = z
      .object({ code: z.string().max(64).optional() })
      .parse(await json(c.req.raw));
    return c.json(
      await transfers(c.env).download(
        c.get("member"),
        id(c.req.param("id")),
        data.code,
      ),
    );
  });
  app.patch("/api/transfers/:id", async (c) =>
    c.json(
      await transfers(c.env).changeRetention(
        c.get("member"),
        id(c.req.param("id")),
        retentionSchema.parse(await json(c.req.raw)).retention,
      ),
    ),
  );
  app.delete("/api/transfers/:id", async (c) =>
    c.json(
      await transfers(c.env).delete(c.get("member"), id(c.req.param("id"))),
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
    const response = await c.env.ASSETS.fetch(c.req.raw);
    const headers = new Headers(response.headers);
    headers.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${new URL(c.env.SUPABASE_URL).origin} https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
    );
    return new Response(response.body, { status: response.status, headers });
  });
  app.onError((error, c) => {
    const e =
      error instanceof AppError
        ? error
        : error instanceof ZodError
          ? new AppError("INVALID", 400)
          : new AppError("UNAVAILABLE", 503);
    const messages: Record<string, string> = {
      UNAUTHORIZED: "กรุณาเข้าสู่ระบบใหม่",
      FORBIDDEN: "บัญชีนี้ไม่มีสิทธิ์ใช้งาน",
      NOT_FOUND: "ไม่พบไฟล์หรือรหัสหมดอายุ",
      QUOTA: "พื้นที่ไม่เพียงพอ กรุณาลบไฟล์เดิม",
      RATE: "ใช้งานถี่เกินไป กรุณารอสักครู่",
      STATE: "สถานะไฟล์เปลี่ยนไป กรุณาลองใหม่",
      FILE_TOO_LARGE: "ไฟล์ต้องไม่เกิน 1 GiB",
      SIZE_MISMATCH: "ไฟล์อัปโหลดไม่ครบ กรุณาส่งใหม่",
      INVALID: "ข้อมูลไม่ถูกต้อง",
      BODY_TOO_LARGE: "ข้อมูลคำขอมีขนาดใหญ่เกินไป",
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
