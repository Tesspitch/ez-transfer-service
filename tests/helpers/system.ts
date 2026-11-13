import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import type { Repository } from "../../src/worker/db";
import type { Storage, Part } from "../../src/worker/storage/r2";
import { domainError } from "../../src/worker/errors";
import type { Env } from "../../src/worker/env";
export const owner = "11111111-1111-4111-8111-111111111111";
export const receiver = "22222222-2222-4222-8222-222222222222";
export async function system(anonymous = false) {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${receiver}');`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202611130001_transfer_core.sql", "utf8"),
  );
  await db.exec(
    `insert into tt.members(user_id) values('${owner}'),('${receiver}');`,
  );
  if (anonymous)
    await db.exec(
      readFileSync(
        "supabase/migrations/202611130002_anonymous_sharing.sql",
        "utf8",
      ),
    );
  const repo: Repository = {
    async call<T>(action: string, p: Record<string, unknown> = {}) {
      try {
        const r = await db.query<{ v: T }>(
          `select public.${anonymous ? "transfer_rpc_v2" : "transfer_rpc"}($1,$2::jsonb) v`,
          [action, JSON.stringify(p)],
        );
        return r.rows[0].v;
      } catch (e) {
        throw domainError((e as Error).message);
      }
    },
  };
  const uploads = new Map<
    string,
    { key: string; parts: Map<number, Uint8Array> }
  >();
  const objects = new Map<string, Uint8Array>();
  const storage: Storage = {
    async create(key) {
      const uploadId = crypto.randomUUID();
      uploads.set(uploadId, { key, parts: new Map() });
      return { uploadId };
    },
    async inspectParts(_key, id) {
      return [...uploads.get(id)!.parts].map(([partNumber, b]) => ({
        partNumber,
        sizeBytes: b.length,
        etag: `etag${partNumber}`,
      }));
    },
    async complete(key, id, parts: Part[]) {
      const upload = uploads.get(id)!;
      const bytes = parts.flatMap((p) => [...upload.parts.get(p.partNumber)!]);
      objects.set(key, new Uint8Array(bytes));
      uploads.delete(id);
    },
    async head(key) {
      const b = objects.get(key);
      return b ? { sizeBytes: b.length } : null;
    },
    async abort(_key, id) {
      uploads.delete(id);
    },
    async delete(key) {
      objects.delete(key);
    },
    async signPart() {
      return "https://r2.example/part";
    },
    async putPart(_key, id, part, body, size) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      if (bytes.length !== size) throw new Error("SIZE");
      uploads.get(id)!.parts.set(part, bytes);
    },
    async signDownload(_key, _name, ttl) {
      return `https://r2.example/download?expires=${ttl}`;
    },
    async listUploads(prefix) {
      return {
        items: [...uploads]
          .filter(([, u]) => u.key.startsWith(prefix))
          .map(([uploadId, u]) => ({
            key: u.key,
            uploadId,
            initiatedAt: "2026-01-01T00:00:00Z",
          })),
      };
    },
    async listObjects() {
      return {
        items: [...objects.keys()].map((key) => ({
          key,
          createdAt: "2026-01-01T00:00:00Z",
        })),
      };
    },
  };
  const env: Env = {
    RATE_KEY_SECRET: "local-test-rate-key",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "",
    R2_ACCOUNT_ID: "",
    R2_BUCKET: "test",
    R2_ACCESS_KEY_ID: "",
    R2_SECRET_ACCESS_KEY: "",
    SHARE_CODE_KEYS: JSON.stringify({ v1: btoa("k".repeat(32)) }),
    SHARE_CODE_ACTIVE_KEY: "v1",
    APP_ORIGIN: "https://app.example",
    ASSETS: {
      async fetch() {
        return new Response("static");
      },
    },
  };
  return { db, repo, storage, env, objects, uploads };
}
