import { z } from "zod";
export const MAX_FILE_BYTES = 1_073_741_824;
export const PART_BYTES = 16_777_216;
export const RETENTIONS = ["1h", "24h", "7d", "forever"] as const;
export type Retention = (typeof RETENTIONS)[number];
export type ShareMode = "single" | "multiple";
export interface OwnerProof {
  ownerHash: string;
}
export interface AccessProof {
  ownerHash?: string;
  receiverHash?: string;
}
export type TransferState =
  "allocating" | "uploading" | "finalizing" | "ready" | "deleting" | "deleted";
export const createTransferSchema = z.object({
  name: z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, "").trim())
    .pipe(z.string().min(1).max(255)),
  sizeBytes: z.number().int().min(1).max(MAX_FILE_BYTES),
  retention: z.enum(RETENTIONS).default("24h"),
  shareMode: z.enum(["single", "multiple"]).default("single"),
});
export const partsSchema = z.object({
  partNumbers: z
    .array(z.number().int().min(1).max(64))
    .min(1)
    .max(3)
    .refine((a) => new Set(a).size === a.length),
});
export const retentionSchema = z
  .object({ retention: z.enum(RETENTIONS) })
  .strict();
export const codeSchema = z.object({ code: z.string().min(1).max(64) });
export function expiresAt(retention: Retention, now: Date): string | null {
  return retention === "forever"
    ? null
    : new Date(
        now.getTime() +
          { "1h": 3600, "24h": 86400, "7d": 604800 }[retention] * 1000,
      ).toISOString();
}
export function downloadTtl(expiry: string | null, now = new Date()): number {
  return expiry === null
    ? 300
    : Math.max(
        0,
        Math.min(300, Math.floor((Date.parse(expiry) - now.getTime()) / 1000)),
      );
}
export function partSize(total: number, part: number): number {
  if (
    !Number.isInteger(part) ||
    part < 1 ||
    part > Math.ceil(total / PART_BYTES)
  )
    throw new Error("INVALID_PART");
  return Math.min(PART_BYTES, total - (part - 1) * PART_BYTES);
}
export interface Member {
  userId: string;
  role: "admin" | "member";
}
export interface TransferRecord {
  id: string;
  owner_id: string;
  owner_token_hash?: string;
  share_mode?: ShareMode;
  receiver_token_hash?: string | null;
  receiver_claim_request_id?: string | null;
  claimed_at?: string | null;
  original_name: string;
  size_bytes: number;
  object_key: string;
  state: TransferState;
  retention: Retention;
  ready_at: string | null;
  expires_at: string | null;
  created_at: string;
  code_hash: string | null;
  code_ciphertext: string | null;
  upload_id: string | null;
  hard_deadline: string;
  latest_url_expires_at: string | null;
  lease_generation: number;
  lease_until: string | null;
  ambiguous_until: string | null;
  accounting: "reserved" | "stored" | "released";
}
export interface TransferView {
  id: string;
  name: string;
  sizeBytes: number;
  state: TransferState;
  retention: Retention;
  readyAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  shareMode?: ShareMode;
  claimedAt?: string | null;
}
export function view(t: TransferRecord): TransferView {
  return {
    id: t.id,
    name: t.original_name,
    sizeBytes: t.size_bytes,
    state: t.state,
    retention: t.retention,
    readyAt: t.ready_at,
    expiresAt: t.expires_at,
    createdAt: t.created_at,
    shareMode: t.share_mode,
    claimedAt: t.claimed_at,
  };
}
export interface UploadSessionView {
  id: string;
  state: TransferState;
  partSizeBytes: number;
  partCount: number;
  uploadDeadline: string;
  mode: "proxy" | "direct";
  shareMode?: ShareMode;
}
export interface SignedPart {
  partNumber: number;
  url: string;
  expiresAt: string;
  mode: "proxy" | "direct";
}
export interface ReadyView {
  id: string;
  code: string;
  readyAt: string;
  expiresAt: string | null;
  shareMode?: ShareMode;
}
export interface Budget {
  limit_bytes: number;
  reserved_bytes: number;
  stored_bytes: number;
}
export interface ApiErrorBody {
  error: { code: string; message: string };
  requestId: string;
}
