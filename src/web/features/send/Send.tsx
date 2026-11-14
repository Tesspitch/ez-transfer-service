import { useEffect, useRef, useState } from "react";
import {
  MAX_FILE_BYTES,
  RETENTIONS,
  type Retention,
  type ReadyView,
  type ShareMode,
} from "../../../shared/contracts";
import { uploadFile } from "./multipart-client";
import {
  addFiles,
  selectedFiles,
  toggleFile,
  type SelectedFile,
} from "./selection";
import { prepareBundle } from "./bundle";
import { bytes, date, copy, grouped, retentionLabels } from "../../lib/format";
import { message } from "../../lib/api";
import {
  managementLink,
  persistentStorageAvailable,
} from "../../lib/local-transfers";
export function Send({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<SelectedFile[]>([]);
  const files = selectedFiles(items);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const [progressTotal, setProgressTotal] = useState(1);
  const [preparing, setPreparing] = useState(false);
  const [retention, setRetention] = useState<Retention>("24h");
  const [shareMode, setShareMode] = useState<ShareMode>("single");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState<ReadyView | null>(null);
  const receivePath = ready
    ? `/receive#code=${encodeURIComponent(ready.code)}`
    : "";
  const receiveLink = ready ? `${location.origin}${receivePath}` : "";
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  function updateItems(next: SelectedFile[]) {
    setItems(next);
    setReady(null);
    setStatus("");
    setError("");
    setSent(0);
  }
  function choose(incoming: Iterable<File>) {
    if (busy) return;
    const result = addFiles(items, incoming);
    updateItems(result.items);
    setError(result.errors.join(" · "));
  }
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (ready)
      resultRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "instant",
      });
  }, [ready]);
  return (
    <div
      className={`workspace-grid send-workspace ${items.length ? "has-files" : "is-empty"} ${ready ? "is-ready" : ""}`}
    >
      <section className="panel">
        <div className="panel-top">
          <span className="window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>send_file</span>
          <span className="dim">/ upload</span>
        </div>
        <div
          className="panel-body"
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              choose(e.clipboardData.files);
            }
          }}
        >
          <p className="command">
            <span>$</span> transfer send
          </p>
          <h2>ส่งไฟล์ไปอีกเครื่อง</h2>
          <p className="muted">เลือกไฟล์ แล้วแชร์รหัสให้เครื่องปลายทาง</p>
          <input
            ref={input}
            className="visually-hidden"
            type="file"
            multiple
            aria-label="เลือกไฟล์"
            disabled={busy}
            onChange={(e) => {
              choose(e.target.files || []);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className={`drop-zone ${drag ? "dragging" : ""}`}
            disabled={busy}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              choose(e.dataTransfer.files);
            }}
          >
            <span className="upload-symbol" aria-hidden="true">
              ↑
            </span>
            <strong>{items.length ? "เพิ่มไฟล์ในรายการ" : "เลือกไฟล์ที่จะส่ง"}</strong>
            <span className="muted">คลิกเลือกหลายไฟล์ · วางจากคลิปบอร์ดได้</span>
            <span className="tag">MAX 1 GiB / 100 FILES</span>
          </button>
          {items.length > 0 && (
            <fieldset className="file-selection" disabled={busy}>
              <legend>
                เลือกไฟล์ที่จะส่ง ({files.length}/{items.length})
              </legend>
              <div className="actions file-tools">
                <button
                  type="button"
                  onClick={() =>
                    updateItems(
                      items.map((item) => ({ ...item, selected: true })),
                    )
                  }
                >
                  เลือกทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateItems(
                      items.map((item) => ({ ...item, selected: false })),
                    )
                  }
                >
                  เอาเครื่องหมายออกทั้งหมด
                </button>
                <button
                  type="button"
                  disabled={items.every((item) => item.selected)}
                  onClick={() =>
                    updateItems(items.filter((item) => item.selected))
                  }
                >
                  ลบไฟล์ที่ไม่ได้เลือก
                </button>
              </div>
              <ul className="file-list">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className={
                      item.selected ? "file-selected" : "file-excluded"
                    }
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={item.selected}
                        aria-label={`ส่งไฟล์ ${item.file.name}`}
                        onChange={(e) =>
                          updateItems(
                            toggleFile(items, item.id, e.target.checked),
                          )
                        }
                      />
                      <span className="file-details">
                        <strong>{item.file.name}</strong>
                        <small>{bytes(item.file.size)}</small>
                      </span>
                    </label>
                    <button
                      type="button"
                      className="subtle"
                      aria-label={`เอา ${item.file.name} ออก`}
                      onClick={() =>
                        updateItems(
                          items.filter((entry) => entry.id !== item.id),
                        )
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <p className="hint">
                เลือก {files.length} ไฟล์ · {bytes(total)}
                {files.length > 1
                  ? " · รวมเป็น ZIP ใช้รหัสเดียว"
                  : files.length === 1
                    ? " · ส่งไฟล์ต้นฉบับ"
                    : " · ติ๊กไฟล์ก่อนส่ง"}
              </p>
              {total > MAX_FILE_BYTES && (
                <p className="error">ขนาดรวมเกิน 1 GiB กรุณาเอาบางไฟล์ออก</p>
              )}
            </fieldset>
          )}
          <div className="send-options">
            <fieldset className="share-options" disabled={busy}>
              <legend>แชร์ไฟล์ให้</legend>
              <div className="share-cards">
                {(["single", "multiple"] as const).map((mode) => (
                  <label
                    className={
                      shareMode === mode ? "share-card selected" : "share-card"
                    }
                    key={mode}
                  >
                    <span>
                      <input
                        type="radio"
                        name="shareMode"
                        value={mode}
                        checked={shareMode === mode}
                        onChange={() => setShareMode(mode)}
                      />
                      <strong>
                        {mode === "single" ? "ผู้รับเดียว" : "หลายผู้รับ"}
                      </strong>
                    </span>
                    <small>
                      {mode === "single"
                        ? "คนแรกที่กดรับสิทธิ์จะรับไฟล์ได้"
                        : "ทุกคนที่มีรหัสรับได้จนหมดอายุ"}
                    </small>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="send-retention">
              {!persistentStorageAvailable() && (
                <p className="hint">
                  เบราว์เซอร์บันทึกประวัติไม่ได้ กรุณาเก็บลิงก์จัดการหลังส่งไฟล์
                </p>
              )}
              <label className="retention-label">
                เก็บไฟล์ไว้
                <select
                  aria-label="เก็บไฟล์ไว้"
                  disabled={busy}
                  value={retention}
                  onChange={(e) => setRetention(e.target.value as Retention)}
                >
                  {RETENTIONS.map((r) => (
                    <option value={r} key={r}>
                      {retentionLabels[r]}
                      {r === "24h" ? " (ค่าเริ่มต้น)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint">
                {retention === "forever"
                  ? "ไฟล์จะใช้พื้นที่จนกว่าคุณจะลบเอง"
                  : "เริ่มนับอายุเมื่ออัปโหลดเสร็จ และลบไฟล์อัตโนมัติเมื่อหมดอายุ"}
              </p>
            </div>
          </div>
          {busy && (
            <div className="progress-section">
              <div className="progress-label">
                <span>{preparing ? "กำลังเตรียม ZIP…" : "กำลังส่งไฟล์…"}</span>
                <span>{Math.round((sent / progressTotal) * 100)}%</span>
              </div>
              <progress max={progressTotal} value={sent} />
              <p className="hint">
                {bytes(sent)} / {bytes(progressTotal)}
              </p>
            </div>
          )}
          <div className="send-submit">
            <div className="send-summary">
              <strong>
                {files.length ? `${files.length} ไฟล์ที่เลือก` : "ยังไม่ได้เลือกไฟล์"}
              </strong>
              <span>
                {files.length
                  ? `${bytes(total)}${files.length > 1 ? " · ZIP" : ""}`
                  : "สูงสุด 1 GiB ต่อชุด"}
              </span>
            </div>
            <div className="actions">
              <button
                className="primary"
                disabled={!files.length || total > MAX_FILE_BYTES || busy}
                onClick={async () => {
                  if (!files.length || total > MAX_FILE_BYTES) return;
                  setBusy(true);
                  setError("");
                  setStatus("");
                  setReady(null);
                  setSent(0);
                  abort.current = new AbortController();
                  try {
                    setPreparing(files.length > 1);
                    setProgressTotal(total || 1);
                    const file = await prepareBundle(files, {
                      signal: abort.current.signal,
                      onProgress: setSent,
                    });
                    setPreparing(false);
                    setSent(0);
                    setProgressTotal(file.size);
                    setReady(
                      await uploadFile(file, retention, {
                        signal: abort.current.signal,
                        onProgress: setSent,
                        shareMode,
                      }),
                    );
                    setStatus("อัปโหลดสำเร็จ พร้อมรับไฟล์จากอีกเครื่อง");
                  } catch (e) {
                    setError(
                      abort.current.signal.aborted
                        ? "ยกเลิกการส่งแล้ว"
                        : message(e),
                    );
                  } finally {
                    setBusy(false);
                    setPreparing(false);
                    onChanged();
                  }
                }}
              >
                {busy ? "กำลังส่ง…" : error ? "ลองส่งอีกครั้ง" : "อัปโหลดไฟล์"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
              {busy && (
                <button onClick={() => abort.current?.abort()}>ยกเลิก</button>
              )}
              {items.length > 0 && !busy && (
                <button
                  className="subtle"
                  onClick={() => {
                    updateItems([]);
                    if (input.current) input.current.value = "";
                  }}
                >
                  ล้าง
                </button>
              )}
            </div>
          </div>
          <p className="error" role="alert">
            {error}
          </p>
          <p role="status" className="success">
            {status}
          </p>
          {ready && (
            <div className="result send-result" ref={resultRef}>
              <p className="badge ready">
                {ready.shareMode === "multiple" ? "หลายผู้รับ" : "ผู้รับเดียว"}
              </p>
              <h3>พร้อมแชร์ไฟล์</h3>
              <label className="receive-link-label">
                ลิงก์รับไฟล์
                <input
                  value={receiveLink}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <p className="hint">ส่งลิงก์นี้ให้ผู้รับ เปิดแล้วค้นหาไฟล์ให้ทันที</p>
              <div className="actions">
                <button
                  className="subtle"
                  onClick={async () =>
                    setStatus(
                      (await copy(ready.code))
                        ? "คัดลอกรหัสแล้ว"
                        : "คัดลอกอัตโนมัติไม่ได้ เลือกรหัสแล้วคัดลอกเองได้",
                    )
                  }
                >
                  คัดลอกรหัส
                </button>
                <button
                  className="primary"
                  onClick={async () =>
                    setStatus(
                      (await copy(receiveLink))
                        ? "คัดลอกลิงก์แล้ว"
                        : "เลือกลิงก์รับไฟล์ด้านบนเพื่อคัดลอกเองได้",
                    )
                  }
                >
                  คัดลอกลิงก์
                </button>
                <a href={receivePath} target="_blank" rel="noreferrer">
                  เปิดลิงก์รับไฟล์
                </a>
              </div>
              <label className="alternate-code">
                รหัสรับไฟล์
                <input
                  className="code-output"
                  value={grouped(ready.code)}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <p className="hint">หมดอายุ: {date(ready.expiresAt)}</p>
              <p className="hint">
                {ready.shareMode === "multiple"
                  ? "ทุกคนที่มีรหัสนี้รับไฟล์ได้จนหมดอายุ"
                  : "คนแรกที่กดรับสิทธิ์จะใช้รหัสนี้รับไฟล์ได้"}
              </p>
              <div className="management-section">
                <h3>จัดการไฟล์นี้</h3>
                <p className="hint">
                  เก็บลิงก์นี้ไว้สำหรับลบหรือเปลี่ยนอายุไฟล์ อย่าส่งให้ผู้รับ
                </p>
                <input
                  aria-label="ลิงก์จัดการไฟล์"
                  readOnly
                  value={managementLink(ready.id)}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  onClick={async () =>
                    setStatus(
                      (await copy(managementLink(ready.id)))
                        ? "คัดลอกลิงก์จัดการแล้ว"
                        : "เลือกลิงก์จัดการด้านบนเพื่อคัดลอกเองได้",
                    )
                  }
                >
                  คัดลอกลิงก์จัดการ
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
