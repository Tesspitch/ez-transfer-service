import { ownerToken } from "./local-transfers";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function ownerHeaders(path: string): Record<string, string> {
  const id = path.match(/\/transfers\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
  const token = id ? ownerToken(id) : undefined;
  return token ? { "X-Transfer-Owner-Token": token } : {};
}
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    method: options.method ?? "GET",
    signal: options.signal,
    headers: {
      ...ownerHeaders(path),
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => ({
    error: { code: "NETWORK", message: "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่" },
  }));
  if (!response.ok)
    throw new ApiError(
      result.error?.code ?? "NETWORK",
      result.error?.message ?? "เกิดข้อผิดพลาด",
      response.status,
    );
  return result as T;
}
export async function putPart(
  url: string,
  blob: Blob,
  mode: "proxy" | "direct",
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: mode === "proxy" ? ownerHeaders(url) : {},
    body: blob,
    signal,
  });
  if (!response.ok)
    throw new ApiError("UPLOAD", "ส่งไฟล์บางส่วนไม่สำเร็จ", response.status);
}
export const message = (e: unknown) =>
  e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่";
