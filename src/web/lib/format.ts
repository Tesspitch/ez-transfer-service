import type { Retention } from "../../shared/contracts";
export const retentionLabels: Record<Retention, string> = {
  "1h": "1 ชั่วโมง",
  "24h": "24 ชั่วโมง",
  "7d": "7 วัน",
  forever: "จนกว่าจะลบเอง",
};
export function bytes(n: number): string {
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + " GiB";
  if (n >= 1048576) return (n / 1048576).toFixed(1) + " MiB";
  if (n >= 1024) return (n / 1024).toFixed(1) + " KiB";
  return n + " B";
}
export function date(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Bangkok",
      }).format(new Date(value))
    : "จนกว่าจะลบเอง";
}
export function grouped(code: string): string {
  return code.match(/.{1,5}/g)?.join("-") ?? code;
}
export async function copy(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
