const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function generateCode(): string {
  let n = 0n;
  for (const b of crypto.getRandomValues(new Uint8Array(16)))
    n = (n << 8n) | BigInt(b);
  let result = "";
  for (let i = 0; i < 26; i++) {
    result = alphabet[Number(n & 31n)] + result;
    n >>= 5n;
  }
  return result;
}
export function normalizeCode(value: string): string {
  const code = value
    .replace(/[\s-]/g, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (!/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(code)) throw new Error("NOT_FOUND");
  return code;
}
export async function hashCode(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizeCode(value)),
  );
  return [...new Uint8Array(bytes)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
const encode = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function keyFor(version: string, keys: Record<string, string>) {
  if (!keys[version]) throw new Error("KEY_UNAVAILABLE");
  return crypto.subtle.importKey(
    "raw",
    decode(keys[version]),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptCode(
  code: string,
  version: string,
  keys: Record<string, string>,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(version) },
    await keyFor(version, keys),
    new TextEncoder().encode(code),
  );
  return [version, encode(iv), encode(new Uint8Array(ciphertext))].join(".");
}
export async function decryptCode(
  value: string,
  keys: Record<string, string>,
): Promise<string> {
  const [version, iv, data] = value.split(".");
  const bytes = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(iv),
      additionalData: new TextEncoder().encode(version),
    },
    await keyFor(version, keys),
    decode(data),
  );
  return new TextDecoder().decode(bytes);
}
