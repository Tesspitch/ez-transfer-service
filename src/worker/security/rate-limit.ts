export async function rateKey(
  request: Request,
  secret: string,
): Promise<string> {
  if (!secret) throw new Error("RATE_KEY_SECRET_REQUIRED");
  const host = new URL(request.url).hostname;
  const local = ["127.0.0.1", "localhost"].includes(host);
  const ip =
    request.headers.get("CF-Connecting-IP") ??
    (local ? "local-development" : null);
  if (!ip) throw new Error("TRUSTED_CLIENT_IP_REQUIRED");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(new Date().toISOString().slice(0, 10) + ":" + ip),
  );
  return [...new Uint8Array(bytes)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
