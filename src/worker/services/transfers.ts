import {
  view,
  downloadTtl,
  type AccessProof,
  type OwnerProof,
  type TransferRecord,
  type Retention,
} from "../../shared/contracts";
import type { Repository } from "../db";
import type { Storage } from "../storage/r2";
import { hashCode, decryptCode } from "../security/share-code";
import { AppError } from "../errors";
async function codeHash(code: string) {
  try {
    return await hashCode(code);
  } catch {
    throw new AppError("NOT_FOUND", 404);
  }
}
export class TransferService {
  constructor(
    private repo: Repository,
    private storage: Storage,
    private keys: Record<string, string>,
  ) {}
  async resolve(access: AccessProof, code: string) {
    const t = await this.repo.call<TransferRecord>("resolve", {
      hash: await codeHash(code),
      receiverHash: access.receiverHash,
    });
    return {
      id: t.id,
      name: t.original_name,
      sizeBytes: t.size_bytes,
      expiresAt: t.expires_at,
      shareMode: t.share_mode,
      receiverStatus:
        t.share_mode === "multiple"
          ? "not-required"
          : t.receiver_token_hash
            ? "mine"
            : "unclaimed",
    };
  }
  async claim(
    receiverHash: string,
    id: string,
    code: string,
    claimRequestId: string,
  ) {
    await this.repo.call("claim", {
      id,
      hash: await codeHash(code),
      receiverHash,
      claimRequestId,
    });
    return { id, claimed: true };
  }
  async download(access: AccessProof, id: string, code?: string) {
    const t = await this.repo.call<TransferRecord>("download", {
      id,
      ...access,
      hash: code ? await codeHash(code) : undefined,
    });
    const ttl = downloadTtl(t.expires_at);
    if (ttl < 1) throw new AppError("NOT_FOUND", 404);
    return {
      url: await this.storage.signDownload(t.object_key, t.original_name, ttl),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }
  async owned(owner: OwnerProof, id: string) {
    return view(
      await this.repo.call<TransferRecord>("owned", { id, ...owner }),
    );
  }
  async code(owner: OwnerProof, id: string) {
    const t = await this.repo.call<TransferRecord>("code", { id, ...owner });
    return { code: await decryptCode(t.code_ciphertext!, this.keys) };
  }
  async changeRetention(owner: OwnerProof, id: string, retention: Retention) {
    return view(
      await this.repo.call<TransferRecord>("retention", {
        id,
        ...owner,
        retention,
      }),
    );
  }
  async delete(owner: OwnerProof, id: string) {
    await this.repo.call("delete", { id, ...owner });
    return { state: "deleting" as const };
  }
}
