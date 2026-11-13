import { useEffect, useRef, useState } from "react";
import { api, ApiError, message } from "../../lib/api";
import { bytes, date } from "../../lib/format";
import {
  receiverClaim,
  receiverForCode,
  rememberClaim,
  forgetClaim,
  newCapability,
  persistentStorageAvailable,
  type ReceiverClaim,
} from "../../lib/local-transfers";
import type { ShareMode } from "../../../shared/contracts";
interface Received {
  id: string;
  name: string;
  sizeBytes: number;
  expiresAt: string | null;
  shareMode: ShareMode;
  receiverStatus: "unclaimed" | "mine" | "not-required";
}
export function Receive({ initialCode }: { initialCode: string }) {
  const restored = useRef(initialCode ? null : receiverClaim());
  const [code, setCode] = useState(
    initialCode || restored.current?.canonicalCode || "",
  );
  const [result, setResult] = useState<Received | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const proof = (claim: ReceiverClaim | null): Record<string, string> =>
    claim ? { "X-Transfer-Receiver-Token": claim.receiverToken } : {};
  async function lookup(value: string) {
    setBusy(true);
    setError("");
    setResult(null);
    const claim = receiverForCode(value);
    try {
      const r = await api<Received>("/transfers/resolve", {
        method: "POST",
        body: { code: value },
        headers: proof(claim),
      });
      setResult(r);
      if (r.receiverStatus === "mine") {
        const existing = receiverClaim(r.id);
        if (existing) rememberClaim({ ...existing, state: "confirmed" });
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (restored.current) void lookup(restored.current.canonicalCode);
  }, []);
  async function download() {
    if (!result) return;
    setBusy(true);
    setError("");
    setStatus("");
    let claim = receiverClaim(result.id);
    try {
      if (result.shareMode === "single") {
        if (!claim) {
          claim = {
            transferId: result.id,
            canonicalCode: code,
            receiverToken: newCapability(),
            claimRequestId: crypto.randomUUID(),
            state: "pending",
          };
          rememberClaim(claim);
        }
        if (claim.state === "pending") {
          await api(`/transfers/${result.id}/claim`, {
            method: "POST",
            body: { code, claimRequestId: claim.claimRequestId },
            headers: proof(claim),
          });
          claim = { ...claim, state: "confirmed" };
          rememberClaim(claim);
        }
        setResult({ ...result, receiverStatus: "mine" });
      }
      const { url } = await api<{ url: string }>(
        `/transfers/${result.id}/download`,
        {
          method: "POST",
          body: result.shareMode === "multiple" ? { code } : {},
          headers: result.shareMode === "single" ? proof(claim) : {},
        },
      );
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noreferrer";
      a.download = result.name;
      document.body.append(a);
      a.click();
      a.remove();
      setStatus("เริ่มดาวน์โหลดแล้ว ตรวจสอบในรายการดาวน์โหลดของเบราว์เซอร์");
    } catch (e) {
      if (e instanceof ApiError && e.code === "FILE_ALREADY_CLAIMED") {
        forgetClaim(result.id);
        setResult(null);
      }
      setError(
        claim?.state === "confirmed"
          ? "ได้รับสิทธิ์แล้ว แต่เริ่มดาวน์โหลดไม่สำเร็จ ลองอีกครั้งได้"
          : message(e),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel receive-panel">
      <div className="panel-top">
        <span className="window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>receive_file</span>
        <span className="dim">02 / retrieve</span>
      </div>
      <div className="panel-body">
        <p className="command">
          <span>$</span> transfer receive
        </p>
        <h2>มีรหัสแล้ว รับไฟล์ได้เลย</h2>
        <p className="muted">วางรหัสจากเครื่องต้นทางเพื่อค้นหาไฟล์</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(code);
          }}
        >
          <label>
            รหัสรับไฟล์
            <input
              className="code-input"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setResult(null);
                setError("");
                setStatus("");
              }}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X"
              maxLength={64}
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "กำลังค้นหา…" : "ค้นหาไฟล์"} <span aria-hidden="true">→</span>
          </button>
        </form>
        <p role="alert" className="error">
          {error}
        </p>
        {result && (
          <div className="result">
            <p className="eyebrow">FILE FOUND</p>
            <h3 className="filename">{result.name}</h3>
            <dl>
              <div>
                <dt>ขนาด</dt>
                <dd>{bytes(result.sizeBytes)}</dd>
              </div>
              <div>
                <dt>แชร์ให้</dt>
                <dd>{result.shareMode === "single" ? "ผู้รับเดียว" : "หลายผู้รับ"}</dd>
              </div>
              <div>
                <dt>หมดอายุ</dt>
                <dd>{date(result.expiresAt)}</dd>
              </div>
            </dl>
            {result.receiverStatus === "mine" && (
              <p className="success">คุณได้รับสิทธิ์แล้ว</p>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={() => void download()}
            >
              {result.shareMode === "multiple"
                ? "ดาวน์โหลดไฟล์"
                : result.receiverStatus === "mine"
                  ? "ดาวน์โหลดอีกครั้ง"
                  : "รับสิทธิ์และดาวน์โหลด"}{" "}
              ↓
            </button>
            <p className="hint">
              {result.shareMode === "multiple"
                ? "ทุกคนที่มีรหัสนี้รับไฟล์ได้จนหมดอายุ"
                : "คนแรกที่กดรับสิทธิ์จะรับไฟล์ได้ เก็บแท็บนี้ไว้เพื่อดาวน์โหลดซ้ำ"}
            </p>
            {!persistentStorageAvailable(true) && (
              <p className="hint">
                เบราว์เซอร์บันทึกสิทธิ์ไม่ได้ กรุณาเก็บแท็บนี้ไว้ระหว่างรับไฟล์
              </p>
            )}
          </div>
        )}
        <p role="status" className="success">
          {status}
        </p>
        <div className="login-note">
          รหัสรับไฟล์ใช้สำหรับดาวน์โหลดเท่านั้น ไม่สามารถลบหรือเปลี่ยนอายุไฟล์ได้
        </div>
      </div>
    </section>
  );
}
