import {
  view,
  downloadTtl,
  type Member,
  type TransferRecord,
  type Retention,
} from "../../shared/contracts";
import type { Repository } from "../db";
import type { Storage } from "../storage/r2";
import { hashCode, decryptCode } from "../security/share-code";
import { AppError } from "../errors";
export class TransferService {
  constructor(
    private repo: Repository,
    private storage: Storage,
    private keys: Record<string, string>,
  ) {}
  async resolve(member: Member, code: string) {
    let hash: string;
    try {
      hash = await hashCode(code);
    } catch {
      throw new AppError("NOT_FOUND", 404);
    }
    const row = await this.repo.call<TransferRecord>("resolve", {
      userId: member.userId,
      hash,
    });
    return {
      id: row.id,
      name: row.original_name,
      sizeBytes: row.size_bytes,
      expiresAt: row.expires_at,
    };
  }
  async download(member: Member, id: string, code?: string) {
    let hash: string | undefined;
    if (code) {
      try {
        hash = await hashCode(code);
      } catch {
        throw new AppError("NOT_FOUND", 404);
      }
    }
    const row = await this.repo.call<TransferRecord>("download", {
      userId: member.userId,
      id,
      hash,
    });
    const ttl = downloadTtl(row.expires_at);
    if (ttl < 1) throw new AppError("NOT_FOUND", 404);
    return {
      url: await this.storage.signDownload(
        row.object_key,
        row.original_name,
        ttl,
      ),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }
  async owned(member: Member, id: string) {
    return view(
      await this.repo.call<TransferRecord>("owned", {
        id,
        userId: member.userId,
      }),
    );
  }
  async list(member: Member, cursor?: string) {
    let parsed: { id: string; time: string } | undefined;
    if (cursor) {
      try {
        parsed = JSON.parse(atob(cursor));
        if (!parsed?.id || !parsed?.time) throw new Error();
      } catch {
        throw new AppError("INVALID");
      }
    }
    const rows = await this.repo.call<TransferRecord[]>("list", {
      userId: member.userId,
      cursor: parsed?.id,
      cursorTime: parsed?.time,
    });
    const items = rows.slice(0, 25);
    const last = items.at(-1);
    return {
      items: items.map(view),
      nextCursor:
        rows.length > 25 && last
          ? btoa(JSON.stringify({ id: last.id, time: last.created_at }))
          : null,
    };
  }
  async code(member: Member, id: string) {
    const row = await this.repo.call<TransferRecord>("code", {
      id,
      userId: member.userId,
    });
    return { code: await decryptCode(row.code_ciphertext!, this.keys) };
  }
  async changeRetention(member: Member, id: string, retention: Retention) {
    return view(
      await this.repo.call<TransferRecord>("retention", {
        id,
        userId: member.userId,
        retention,
      }),
    );
  }
  async delete(member: Member, id: string) {
    await this.repo.call("delete", { id, userId: member.userId });
    return { state: "deleting" as const };
  }
}
