import { AppError } from "../errors";
export async function hashCapability(
  token: string | undefined,
  role: "owner" | "receiver",
): Promise<string> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new AppError("NOT_FOUND", 404);
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`transfer-${role}:v2:${token}`),
  );
  return [...new Uint8Array(bytes)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
