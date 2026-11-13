import type {
  Retention,
  UploadSessionView,
  SignedPart,
  ReadyView,
  ShareMode,
} from "../../../shared/contracts";
import { api, putPart, ApiError } from "../../lib/api";
import {
  prepareUpload,
  rememberTransfer,
  finishPending,
} from "../../lib/local-transfers";
export interface UploadTransport {
  create(
    file: File,
    retention: Retention,
    key: string,
    signal: AbortSignal,
  ): Promise<UploadSessionView>;
  parts(
    id: string,
    numbers: number[],
    signal: AbortSignal,
  ): Promise<SignedPart[]>;
  put(part: SignedPart, blob: Blob, signal: AbortSignal): Promise<void>;
  complete(id: string, signal: AbortSignal): Promise<ReadyView>;
  cancel(id: string): Promise<void>;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}
function defaultTransport(shareMode: ShareMode): UploadTransport {
  return {
    create: async (file, retention, _key, signal) => {
      const pending = prepareUpload(
        JSON.stringify([
          file.name,
          file.size,
          file.lastModified,
          retention,
          shareMode,
        ]),
      );
      const result = await api<UploadSessionView>("/transfers", {
        method: "POST",
        body: { name: file.name, sizeBytes: file.size, retention, shareMode },
        headers: {
          "Idempotency-Key": pending.key,
          "X-Transfer-Owner-Token": pending.ownerToken,
        },
        signal,
      });
      rememberTransfer({
        id: result.id,
        ownerToken: pending.ownerToken,
        createdAt: new Date().toISOString(),
      });
      finishPending();
      return result;
    },
    parts: async (id, partNumbers, signal) =>
      (
        await api<{ parts: SignedPart[] }>(`/transfers/${id}/parts`, {
          method: "POST",
          body: { partNumbers },
          signal,
        })
      ).parts,
    put: (part, blob, signal) => putPart(part.url, blob, part.mode, signal),
    complete: (id, signal) =>
      api(`/transfers/${id}/complete`, { method: "POST", body: {}, signal }),
    cancel: (id) => api(`/transfers/${id}`, { method: "DELETE" }),
    sleep: (ms, signal) =>
      new Promise((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, ms);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      }),
  };
}
export async function uploadFile(
  file: File,
  retention: Retention,
  options: {
    signal: AbortSignal;
    onProgress: (bytes: number) => void;
    transport?: UploadTransport;
    shareMode?: ShareMode;
  },
): Promise<ReadyView> {
  const transport =
    options.transport ?? defaultTransport(options.shareMode ?? "single");
  const controller = new AbortController();
  const forward = () => controller.abort();
  options.signal.addEventListener("abort", forward, { once: true });
  if (options.signal.aborted) controller.abort();
  let id: string | undefined;
  let done = 0;
  let completing = false;
  try {
    const session = await transport.create(
      file,
      retention,
      crypto.randomUUID(),
      controller.signal,
    );
    id = session.id;
    for (
      let start = session.state === "ready" ? session.partCount + 1 : 1;
      start <= session.partCount;
      start += 3
    ) {
      controller.signal.throwIfAborted();
      const numbers = Array.from(
        { length: Math.min(3, session.partCount - start + 1) },
        (_, i) => start + i,
      );
      const batch = await transport.parts(id, numbers, controller.signal);
      const jobs = batch.map(async (part) => {
        const blob = file.slice(
          (part.partNumber - 1) * session.partSizeBytes,
          part.partNumber * session.partSizeBytes,
        );
        for (let attempt = 0; ; attempt++) {
          controller.signal.throwIfAborted();
          try {
            if (Date.parse(part.expiresAt) <= Date.now())
              part = (
                await transport.parts(id!, [part.partNumber], controller.signal)
              )[0];
            await transport.put(part, blob, controller.signal);
            done += blob.size;
            options.onProgress(done);
            return;
          } catch (e) {
            if (
              controller.signal.aborted ||
              attempt >= 3 ||
              (e instanceof ApiError && [403, 404, 409, 413].includes(e.status))
            )
              throw e;
            await transport.sleep(
              500 * 2 ** attempt + Math.random() * 250,
              controller.signal,
            );
            part = (
              await transport.parts(id!, [part.partNumber], controller.signal)
            )[0];
          }
        }
      });
      const results = await Promise.allSettled(jobs);
      const failure = results.find((r) => r.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    }
    completing = true;
    for (let attempt = 0; ; attempt++) {
      try {
        return await transport.complete(id, controller.signal);
      } catch {
        if (attempt >= 2 || controller.signal.aborted)
          throw new Error("ยังยืนยันผลการส่งไม่ได้ กรุณาตรวจสอบในไฟล์ของฉันก่อนส่งใหม่");
        await transport.sleep(500 * 2 ** attempt, controller.signal);
      }
    }
  } catch (e) {
    controller.abort();
    if (id && !completing) await transport.cancel(id).catch(() => {});
    throw e;
  } finally {
    options.signal.removeEventListener("abort", forward);
  }
}
