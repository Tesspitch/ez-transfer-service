import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "../env";
import { boundedStream } from "./bounded-stream";
import { RequestBudget, budgetFetch } from "../security/request-budget";
export interface Part {
  partNumber: number;
  sizeBytes: number;
  etag: string;
}
export interface Storage {
  create(key: string): Promise<{ uploadId: string }>;
  inspectParts(key: string, id: string): Promise<Part[]>;
  complete(key: string, id: string, parts: Part[]): Promise<void>;
  head(key: string): Promise<{ sizeBytes: number } | null>;
  abort(key: string, id: string): Promise<void>;
  delete(key: string): Promise<void>;
  signPart(input: {
    key: string;
    uploadId: string;
    partNumber: number;
    sizeBytes: number;
    ttlSeconds: number;
  }): Promise<string>;
  putPart(
    key: string,
    id: string,
    part: number,
    source: ReadableStream<Uint8Array>,
    size: number,
  ): Promise<void>;
  signDownload(key: string, name: string, ttl: number): Promise<string>;
  listUploads(
    prefix: string,
    cursor?: string,
  ): Promise<{
    items: { key: string; uploadId: string; initiatedAt: string }[];
    nextCursor?: string;
  }>;
  listObjects(cursor?: string): Promise<{
    items: { key: string; createdAt: string }[];
    nextCursor?: string;
  }>;
}
export function attachment(name: string): string {
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255);
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16),
  );
  return `attachment; filename="download"; filename*=UTF-8''${encoded}`;
}
export function createStorage(env: Env, budget = new RequestBudget()): Storage {
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const bucket = env.R2_BUCKET;
  s3.middlewareStack.add(
    (next) => async (args) => {
      budget.take();
      return next(args);
    },
    { step: "finalizeRequest", name: "invocationBudget" },
  );
  const send = budgetFetch(budget);
  const store: Storage = {
    async create(key) {
      const r = await s3.send(
        new CreateMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          ContentType: "application/octet-stream",
        }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
      if (!r.UploadId) throw new Error("MISSING_UPLOAD");
      return { uploadId: r.UploadId };
    },
    async inspectParts(key, id) {
      const parts: Part[] = [];
      let marker: string | undefined;
      do {
        const r = await s3.send(
          new ListPartsCommand({
            Bucket: bucket,
            Key: key,
            UploadId: id,
            PartNumberMarker: marker,
          }),
          { abortSignal: AbortSignal.timeout(30000) },
        );
        for (const p of r.Parts ?? [])
          parts.push({
            partNumber: p.PartNumber!,
            sizeBytes: p.Size!,
            etag: p.ETag!,
          });
        marker = r.IsTruncated ? r.NextPartNumberMarker : undefined;
      } while (marker);
      return parts;
    },
    async complete(key, id, parts) {
      await s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: id,
          MultipartUpload: {
            Parts: parts.map((p) => ({
              PartNumber: p.partNumber,
              ETag: p.etag,
            })),
          },
        }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
    },
    async head(key) {
      try {
        const r = await s3.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
          { abortSignal: AbortSignal.timeout(30000) },
        );
        return { sizeBytes: r.ContentLength! };
      } catch (e) {
        if (
          (e as { $metadata?: { httpStatusCode: number } }).$metadata
            ?.httpStatusCode === 404
        )
          return null;
        throw e;
      }
    },
    async abort(key, id) {
      try {
        await s3.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: id,
          }),
          { abortSignal: AbortSignal.timeout(30000) },
        );
      } catch (e) {
        if ((e as { name: string }).name !== "NoSuchUpload") throw e;
      }
    },
    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(30000),
      });
    },
    async signPart(p) {
      return getSignedUrl(
        s3,
        new UploadPartCommand({
          Bucket: bucket,
          Key: p.key,
          UploadId: p.uploadId,
          PartNumber: p.partNumber,
          ContentLength: p.sizeBytes,
        }),
        {
          expiresIn: p.ttlSeconds,
          signableHeaders: new Set(["content-length"]),
        },
      );
    },
    async putPart(key, id, part, source, size) {
      // FixedLengthStream gives the Workers fetch runtime a trusted Content-Length without buffering.
      const FixedLength = (
        globalThis as typeof globalThis & {
          FixedLengthStream: new (length: number) => {
            readable: ReadableStream<Uint8Array>;
            writable: WritableStream<Uint8Array>;
          };
        }
      ).FixedLengthStream;
      if (!FixedLength) throw new Error("WORKERS_RUNTIME_REQUIRED");
      const url = await store.signPart({
        key,
        uploadId: id,
        partNumber: part,
        sizeBytes: size,
        ttlSeconds: 120,
      });
      const fixed = new FixedLength(size);
      const controller = new AbortController();
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(120000),
      ]);
      const pipe = boundedStream(source, size)
        .pipeTo(fixed.writable, { signal })
        .catch((error) => {
          controller.abort();
          throw error;
        });
      const upload = send(url, {
        method: "PUT",
        body: fixed.readable,
        signal,
      })
        .then((r) => {
          if (!r.ok) throw new Error("UPLOAD_FAILED");
        })
        .catch((error) => {
          controller.abort();
          throw error;
        });
      await Promise.all([pipe, upload]);
    },
    signDownload(key, name, ttl) {
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentType: "application/octet-stream",
          ResponseContentDisposition: attachment(name),
          ResponseCacheControl: "private, no-store",
        }),
        { expiresIn: ttl },
      );
    },
    async listUploads(prefix, cursor) {
      const marks = cursor
        ? (JSON.parse(atob(cursor)) as { key: string; id: string })
        : undefined;
      const r = await s3.send(
        new ListMultipartUploadsCommand({
          Bucket: bucket,
          Prefix: prefix,
          MaxUploads: 3,
          KeyMarker: marks?.key,
          UploadIdMarker: marks?.id,
        }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
      return {
        items: (r.Uploads ?? []).map((x) => ({
          key: x.Key!,
          uploadId: x.UploadId!,
          initiatedAt: x.Initiated!.toISOString(),
        })),
        nextCursor: r.IsTruncated
          ? btoa(
              JSON.stringify({
                key: r.NextKeyMarker,
                id: r.NextUploadIdMarker,
              }),
            )
          : undefined,
      };
    },
    async listObjects(cursor) {
      const r = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: "transfers/",
          MaxKeys: 3,
          ContinuationToken: cursor,
        }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
      return {
        items: (r.Contents ?? []).map((x) => ({
          key: x.Key!,
          createdAt: x.LastModified!.toISOString(),
        })),
        nextCursor: r.IsTruncated ? r.NextContinuationToken : undefined,
      };
    },
  };
  return store;
}
