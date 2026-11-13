import { useState } from "react";
import { api, message } from "../../lib/api";
import { bytes, date } from "../../lib/format";
interface Received {
  id: string;
  name: string;
  sizeBytes: number;
  expiresAt: string | null;
}
export function Receive({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState<Received | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
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
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setResult(null);
            try {
              setResult(
                await api("/transfers/resolve", {
                  method: "POST",
                  body: { code },
                }),
              );
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
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
        <p className="error" role="alert">
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
                <dt>หมดอายุ</dt>
                <dd>{date(result.expiresAt)}</dd>
              </div>
            </dl>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const { url } = await api<{ url: string }>(
                    `/transfers/${result.id}/download`,
                    { method: "POST", body: { code } },
                  );
                  const link = document.createElement("a");
                  link.href = url;
                  link.rel = "noreferrer";
                  link.download = result.name;
                  document.body.append(link);
                  link.click();
                  link.remove();
                  setStatus(
                    "เริ่มดาวน์โหลดแล้ว ตรวจสอบในรายการดาวน์โหลดของเบราว์เซอร์",
                  );
                } catch (e) {
                  setError(message(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              ดาวน์โหลดไฟล์ <span aria-hidden="true">↓</span>
            </button>
          </div>
        )}
        <p role="status" className="success">
          {status}
        </p>
        <div className="login-note">รับไฟล์ได้เฉพาะสมาชิกที่มีสิทธิ์และมีรหัสเท่านั้น</div>
      </div>
    </section>
  );
}
