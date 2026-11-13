import {
  PART_BYTES,
  partSize,
  partsSchema,
  type Member,
  type TransferRecord,
  type UploadSessionView,
  type Retention,
  type SignedPart,
  type ReadyView,
} from "../../shared/contracts";
import type { Repository } from "../db";
import type { Storage } from "../storage/r2";
import type { Env } from "../env";
import { AppError } from "../errors";
import {
  generateCode,
  hashCode,
  encryptCode,
  decryptCode,
} from "../security/share-code";
export class UploadService {
  constructor(
    private repo: Repository,
    private storage: Storage,
    private env: Env,
  ) {}
  async create(
    member: Member,
    input: { name: string; sizeBytes: number; retention: Retention },
    key: string,
  ): Promise<UploadSessionView> {
    let row = await this.repo.call<TransferRecord & { _created: boolean }>(
      "reserve",
      { userId: member.userId, ...input, key },
    );
    if (row._created) {
      try {
        const r = await this.storage.create(row.object_key);
        try {
          row = await this.repo.call("activate", {
            id: row.id,
            generation: row.lease_generation,
            uploadId: r.uploadId,
          });
        } catch (e) {
          await this.storage.abort(row.object_key, r.uploadId).catch(() => {});
          throw e;
        }
      } catch (e) {
        await this.repo.call("compensate", { id: row.id }).catch(() => {});
        throw e;
      }
    }
    if (!["uploading", "ready"].includes(row.state))
      throw new AppError("STATE", 409);
    return {
      id: row.id,
      state: row.state,
      partSizeBytes: PART_BYTES,
      partCount: Math.ceil(row.size_bytes / PART_BYTES),
      uploadDeadline: row.hard_deadline,
      mode: this.env.DIRECT_UPLOAD_VERIFIED === "true" ? "direct" : "proxy",
    };
  }
  async signParts(
    member: Member,
    id: string,
    values: number[],
  ): Promise<SignedPart[]> {
    const { partNumbers } = partsSchema.parse({ partNumbers: values });
    const row = await this.repo.call<TransferRecord>("parts", {
      userId: member.userId,
      id,
      until: new Date(Date.now() + 600000).toISOString(),
    });
    const ttl = Math.min(
      600,
      Math.floor((Date.parse(row.hard_deadline) - Date.now()) / 1000),
    );
    if (ttl < 1) throw new AppError("STATE", 409);
    return Promise.all(
      partNumbers.map(async (partNumber) => {
        const sizeBytes = partSize(row.size_bytes, partNumber);
        const direct = this.env.DIRECT_UPLOAD_VERIFIED === "true";
        return {
          partNumber,
          url: direct
            ? await this.storage.signPart({
                key: row.object_key,
                uploadId: row.upload_id!,
                partNumber,
                sizeBytes,
                ttlSeconds: ttl,
              })
            : `/api/transfers/${id}/part/${partNumber}`,
          expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
          mode: direct ? ("direct" as const) : ("proxy" as const),
        };
      }),
    );
  }
  async putPart(
    member: Member,
    id: string,
    part: number,
    body: ReadableStream<Uint8Array> | null,
  ): Promise<void> {
    if (!body) throw new AppError("INVALID");
    const row = await this.repo.call<TransferRecord>("parts", {
      userId: member.userId,
      id,
      until: new Date(Date.now() + 120000).toISOString(),
    });
    let size: number;
    try {
      size = partSize(row.size_bytes, part);
    } catch {
      throw new AppError("INVALID");
    }
    await this.storage.putPart(
      row.object_key,
      row.upload_id!,
      part,
      body,
      size,
    );
    // A delete may have won during the external part operation. It must not authorize completion.
  }
  async complete(member: Member, id: string): Promise<ReadyView> {
    let row = await this.repo.call<TransferRecord>("begin_finalize", {
      userId: member.userId,
      id,
    });
    if (row.state !== "ready") {
      try {
        const parts = (
          await this.storage.inspectParts(row.object_key, row.upload_id!)
        ).sort((a, b) => a.partNumber - b.partNumber);
        if (
          parts.length !== Math.ceil(row.size_bytes / PART_BYTES) ||
          parts.some(
            (p, i) =>
              p.partNumber !== i + 1 ||
              p.sizeBytes !== partSize(row.size_bytes, i + 1),
          )
        )
          throw new AppError("SIZE_MISMATCH", 409);
        await this.storage.complete(row.object_key, row.upload_id!, parts);
        const head = await this.storage.head(row.object_key);
        if (head?.sizeBytes !== row.size_bytes)
          throw new AppError("SIZE_MISMATCH", 409);
        const code = generateCode();
        const keys = JSON.parse(this.env.SHARE_CODE_KEYS) as Record<
          string,
          string
        >;
        row = await this.repo.call<TransferRecord>("ready", {
          id,
          generation: row.lease_generation,
          hash: await hashCode(code),
          ciphertext: await encryptCode(
            code,
            this.env.SHARE_CODE_ACTIVE_KEY,
            keys,
          ),
        });
      } catch (e) {
        const current = await this.repo
          .call<TransferRecord>("owned", { id, userId: member.userId })
          .catch(() => null);
        if (current?.state === "ready") row = current;
        else {
          await this.repo
            .call("compensate", { id, generation: row.lease_generation })
            .catch(() => {});
          throw e;
        }
      }
    }
    if (row.expires_at && Date.parse(row.expires_at) <= Date.now())
      throw new AppError("NOT_FOUND", 404);
    return {
      id: row.id,
      code: await decryptCode(
        row.code_ciphertext!,
        JSON.parse(this.env.SHARE_CODE_KEYS),
      ),
      readyAt: row.ready_at!,
      expiresAt: row.expires_at,
    };
  }
}
