export interface LocalTransfer {
  id: string;
  ownerToken: string;
  createdAt: string;
}
export interface PendingUpload {
  key: string;
  ownerToken: string;
  fingerprint: string;
}
export interface ReceiverClaim {
  transferId: string;
  canonicalCode: string;
  receiverToken: string;
  claimRequestId: string;
  state: "pending" | "confirmed";
}
const memory = new Map<string, string>();
const volatileKeys = new Set<string>();
export function newCapability(): string {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
function storage(session = false) {
  try {
    return session ? sessionStorage : localStorage;
  } catch {
    return undefined;
  }
}
function read<T>(key: string, fallback: T, session = false): T {
  let text = memory.get(key);
  if (!volatileKeys.has(key)) {
    try {
      text = storage(session)?.getItem(key) ?? text;
    } catch {
      /* use memory */
    }
  }
  try {
    return JSON.parse(text ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown, session = false) {
  const text = JSON.stringify(value);
  memory.set(key, text);
  try {
    const s = storage(session);
    if (!s) throw new Error("unavailable");
    s.setItem(key, text);
    volatileKeys.delete(key);
  } catch {
    volatileKeys.add(key);
  }
}
export function persistentStorageAvailable(session = false): boolean {
  try {
    const s = storage(session);
    if (!s) return false;
    s.setItem("transfer-probe", "1");
    s.removeItem("transfer-probe");
    return true;
  } catch {
    return false;
  }
}
export function localTransfers(): LocalTransfer[] {
  return read("transfer-owned", []);
}
export function rememberTransfer(value: LocalTransfer) {
  write("transfer-owned", [
    value,
    ...localTransfers().filter((t) => t.id !== value.id),
  ]);
}
export function ownerToken(id: string): string | undefined {
  return localTransfers().find((t) => t.id === id)?.ownerToken;
}
export function prepareUpload(fingerprint: string): PendingUpload {
  const old = read<PendingUpload | null>("transfer-pending", null);
  if (old?.fingerprint === fingerprint) return old;
  const pending = {
    key: crypto.randomUUID(),
    ownerToken: newCapability(),
    fingerprint,
  };
  write("transfer-pending", pending);
  return pending;
}
export function finishPending() {
  write("transfer-pending", null);
}
export function receiverClaim(id?: string): ReceiverClaim | null {
  const active =
    id ?? read<string | null>("transfer-receiver-active", null, true);
  return active ? read("transfer-receiver:" + active, null, true) : null;
}
export function rememberClaim(claim: ReceiverClaim) {
  write(
    "transfer-receiver-index",
    [
      claim.transferId,
      ...read<string[]>("transfer-receiver-index", [], true).filter(
        (id) => id !== claim.transferId,
      ),
    ],
    true,
  );
  write("transfer-receiver:" + claim.transferId, claim, true);
  write("transfer-receiver-active", claim.transferId, true);
}
export function receiverForCode(code: string): ReceiverClaim | null {
  const canonical = (value: string) =>
    value
      .replace(/[\s-]/g, "")
      .toUpperCase()
      .replace(/O/g, "0")
      .replace(/[IL]/g, "1");
  const ids = read<string[]>("transfer-receiver-index", [], true);
  const active = receiverClaim();
  const records = [active, ...ids.map((id) => receiverClaim(id))];
  return (
    records.find(
      (record) => record && canonical(record.canonicalCode) === canonical(code),
    ) ?? null
  );
}
export function forgetClaim(id: string) {
  const active = receiverClaim()?.transferId;
  write("transfer-receiver:" + id, null, true);
  if (active === id) write("transfer-receiver-active", null, true);
}
export function managementLink(id: string): string {
  const token = ownerToken(id);
  return token ? `${location.origin}/manage#id=${id}&owner=${token}` : "";
}
