import { useEffect, useRef, useState } from "react";
import {
  MAX_FILE_BYTES,
  RETENTIONS,
  type Retention,
  type ReadyView,
  type ShareMode,
} from "../../../shared/contracts";
import { uploadFile } from "./multipart-client";
import { bytes, date, copy, grouped, retentionLabels } from "../../lib/format";
import { message } from "../../lib/api";
import {
  managementLink,
  persistentStorageAvailable,
} from "../../lib/local-transfers";
export function Send({ onChanged }: { onChanged: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [retention, setRetention] = useState<Retention>("24h");
  const [shareMode, setShareMode] = useState<ShareMode>("single");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState<ReadyView | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  function choose(f: File | undefined) {
    if (!f || busy) return;
    setReady(null);
    setError("");
    setStatus("");
    setSent(0);
    if (!f.size || f.size > MAX_FILE_BYTES) {
      setFile(null);
      setError("เลือกไฟล์ที่มีขนาดมากกว่า 0 และไม่เกิน 1 GiB");
      return;
    }
    setFile(f);
  }
  useEffect(() => () => abort.current?.abort(), []);
  return (
    <div className="workspace-grid">
      <section className="panel">
        <div className="panel-top">
          <span className="window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>send_file</span>
          <span className="dim">01 / upload</span>
        </div>
        <div
          className="panel-body"
          onPaste={(e) => {
            const f = e.clipboardData.files[0];
            if (f) {
              e.preventDefault();
              choose(f);
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
            aria-label="เลือกไฟล์"
            disabled={busy}
            onChange={(e) => choose(e.target.files?.[0])}
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
              choose(e.dataTransfer.files[0]);
            }}
          >
            <span className="upload-symbol" aria-hidden="true">
              ↑
            </span>
            <strong>{file ? file.name : "ลากไฟล์มาวางที่นี่"}</strong>
            <span className="muted">
              {file ? bytes(file.size) : "หรือคลิกเลือกไฟล์ · วางจากคลิปบอร์ดได้"}
            </span>
            <span className="tag">MAX 1 GiB / SINGLE FILE</span>
          </button>
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
                    <strong>{mode === "single" ? "ผู้รับเดียว" : "หลายผู้รับ"}</strong>
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
          {busy && (
            <div className="progress-section">
              <div className="progress-label">
                <span>กำลังส่งไฟล์…</span>
                <span>{Math.round((sent / (file?.size || 1)) * 100)}%</span>
              </div>
              <progress max={file?.size || 1} value={sent} />
              <p className="hint">
                {bytes(sent)} / {bytes(file?.size || 0)}
              </p>
            </div>
          )}
          <div className="actions">
            <button
              className="primary"
              disabled={!file || busy}
              onClick={async () => {
                if (!file) return;
                setBusy(true);
                setError("");
                setStatus("");
                setReady(null);
                setSent(0);
                abort.current = new AbortController();
                try {
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
                    abort.current.signal.aborted ? "ยกเลิกการส่งแล้ว" : message(e),
                  );
                } finally {
                  setBusy(false);
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
            {file && !busy && (
              <button
                className="subtle"
                onClick={() => {
                  setFile(null);
                  setReady(null);
                  setSent(0);
                  setError("");
                  if (input.current) input.current.value = "";
                }}
              >
                ล้าง
              </button>
            )}
          </div>
          <p className="error" role="alert">
            {error}
          </p>
          <p role="status" className="success">
            {status}
          </p>
          {ready && (
            <div className="result">
              <p className="badge ready">
                {ready.shareMode === "multiple" ? "หลายผู้รับ" : "ผู้รับเดียว"}
              </p>
              <div className="eyebrow">TRANSFER READY</div>
              <label>
                รหัสรับไฟล์
                <input
                  className="code-output"
                  value={grouped(ready.code)}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <div className="actions">
                <button
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
                  onClick={async () =>
                    setStatus(
                      (await copy(
                        `${location.origin}/receive#code=${ready.code}`,
                      ))
                        ? "คัดลอกลิงก์แล้ว"
                        : "คัดลอกอัตโนมัติไม่ได้ กรุณาคัดลอกรหัสแทน",
                    )
                  }
                >
                  คัดลอกลิงก์
                </button>
              </div>
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
      <aside>
        <div className="side-note">
          <p className="eyebrow">HOW IT WORKS</p>
          <ol className="steps">
            <li>
              <span>01</span>
              <div>
                <strong>เลือกและอัปโหลดไฟล์</strong>
                <p>ตั้งเวลาเก็บให้พอดีกับงาน</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>คัดลอกรหัสหรือลิงก์</strong>
                <p>ส่งให้ตัวเองหรือเพื่อนร่วมทีม</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>เปิดเว็บบนอีกเครื่อง</strong>
                <p>กรอกรหัส แล้วดาวน์โหลดได้เลย</p>
              </div>
            </li>
          </ol>
        </div>
        <div className="tip">
          <span className="command">// GOOD TO KNOW</span>
          <p>
            อัปโหลดเสร็จแล้วปิดเครื่องได้
            <br />
            ไฟล์ยังพร้อมให้รับตามอายุที่เลือก
          </p>
        </div>
      </aside>
    </div>
  );
}
