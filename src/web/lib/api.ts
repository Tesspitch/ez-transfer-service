import { authClient } from "./auth";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
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
  const client = authClient;
  if (!client) throw new ApiError("CONFIG", "ระบบยังไม่พร้อม กรุณาติดต่อผู้ดูแล", 503);
  const { data } = await client.auth.getSession();
  let token = data.session?.access_token;
  const run = () =>
    fetch("/api" + path, {
      method: options.method ?? "GET",
      signal: options.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  let response = await run();
  if (response.status === 401) {
    const { data: renewed, error } = await client.auth.refreshSession();
    if (!error && renewed.session) {
      token = renewed.session.access_token;
      response = await run();
    }
  }
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
  const headers: Record<string, string> = {};
  if (mode === "proxy") {
    const { data } = await authClient!.auth.getSession();
    headers.Authorization = `Bearer ${data.session?.access_token}`;
  }
  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: blob,
    signal,
  });
  if (!response.ok) {
    if (response.status === 401 && mode === "proxy")
      await authClient!.auth.refreshSession();
    throw new ApiError("UPLOAD", "ส่งไฟล์บางส่วนไม่สำเร็จ", response.status);
  }
}
export const message = (e: unknown) =>
  e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่";
