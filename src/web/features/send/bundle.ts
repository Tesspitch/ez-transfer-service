import { MAX_FILE_BYTES } from "../../../shared/contracts";
interface Options {
  signal: AbortSignal;
  onProgress: (bytes: number, total: number) => void;
}
function safeName(name: string): string {
  return (
    name
      .replace(/^[.]+[\\/]+/, "_")
      .replace(/[\\/\u0000-\u001f\u007f]/g, "_")
      .replace(/^\.+$/, "file") || "file"
  );
}
function uniqueName(original: string, used: Set<string>): string {
  const name = safeName(original);
  let candidate = name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name,
    ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; used.has(candidate); i++) candidate = `${stem} (${i})${ext}`;
  used.add(candidate);
  return candidate;
}
export async function prepareBundle(
  files: File[],
  options: Options,
): Promise<File> {
  options.signal.throwIfAborted();
  if (!files.length) throw new Error("เลือกอย่างน้อย 1 ไฟล์ก่อนส่ง");
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_FILE_BYTES) throw new Error("ไฟล์ที่เลือกมีขนาดรวมเกิน 1 GiB");
  if (files.length === 1) {
    options.onProgress(total, total);
    return files[0];
  }
  const { ZipWriter, BlobWriter, BlobReader } = await import("@zip.js/zip.js");
  // Keep retry identity stable while distinguishing different selections.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify(
        files.map((file) => [file.name, file.size, file.lastModified]),
      ),
    ),
  );
  const identity = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, 16);
  options.signal.throwIfAborted();
  const writer = new ZipWriter(new BlobWriter("application/zip"), {
    level: 0,
    useWebWorkers: false,
    zip64: false,
  });
  const names = new Set<string>();
  let complete = 0;
  try {
    for (const file of files) {
      options.signal.throwIfAborted();
      await writer.add(uniqueName(file.name, names), new BlobReader(file), {
        level: 0,
        useWebWorkers: false,
        lastModDate: new Date(file.lastModified),
        signal: options.signal,
        onprogress: (loaded) => options.onProgress(complete + loaded, total),
      });
      complete += file.size;
      options.onProgress(complete, total);
    }
    const blob = await writer.close();
    options.signal.throwIfAborted();
    if (blob.size > MAX_FILE_BYTES)
      throw new Error("ขนาด ZIP รวมข้อมูลกำกับเกิน 1 GiB กรุณาเอาบางไฟล์ออก");
    return new File([blob], `transfer-${identity}.zip`, {
      type: "application/zip",
      lastModified: Math.max(...files.map((file) => file.lastModified)),
    });
  } catch (error) {
    await writer.close().catch(() => {});
    throw error;
  }
}
