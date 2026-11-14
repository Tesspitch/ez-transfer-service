import { useCallback, useEffect, useState } from "react";
import {
  RETENTIONS,
  type TransferView,
  type Retention,
} from "../../../shared/contracts";
import { api, message } from "../../lib/api";
import { bytes, date, copy, retentionLabels, grouped } from "../../lib/format";
import { localTransfers } from "../../lib/local-transfers";
export function MyFiles({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<TransferView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [copiedCode, setCopiedCode] = useState("");
  const [removing, setRemoving] = useState<TransferView | null>(null);
  const [editing, setEditing] = useState<TransferView | null>(null);
  const [retention, setRetention] = useState<Retention>("24h");
  const load = useCallback(async (next?: string) => {
    setBusy(true);
    setError("");
    try {
      const offset = next ? Number(next) : 0;
      const local = localTransfers();
      const page = local.slice(offset, offset + 25);
      const loaded: TransferView[] = [];
      for (let start = 0; start < page.length; start += 3) {
        const rows = await Promise.all(
          page.slice(start, start + 3).map(async (item) => {
            try {
              return await api<TransferView>(`/transfers/${item.id}`);
            } catch (e) {
              if (e instanceof Error && "status" in e && e.status === 404)
                return null;
              throw e;
            }
          }),
        );
        for (const row of rows)
          if (row && row.state !== "deleted") loaded.push(row);
      }
      const result = {
        items: loaded,
        nextCursor: offset + 25 < local.length ? String(offset + 25) : null,
      };
      setItems((old) => (next ? [...old, ...result.items] : result.items));
      setCursor(result.nextCursor);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
      onChanged();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel">
      <div className="panel-top">
        <span className="window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>my_files</span>
        <span className="dim">/ manage</span>
      </div>
      <div className="panel-body">
        <div className="heading-row">
          <div>
            <p className="command">
              <span>$</span> transfer list
            </p>
            <h2>ไฟล์บนเครื่องนี้</h2>
          </div>
          <button disabled={busy} onClick={() => void load()}>
            รีเฟรช ↻
          </button>
        </div>
        <p className="muted">
          ประวัติของเบราว์เซอร์นี้ ล้างข้อมูลหรือเปลี่ยนเครื่องแล้วรายการจะไม่ตามไปด้วย
          เก็บลิงก์จัดการไว้เพื่อเปิดไฟล์เดิม
        </p>
        <p role="alert" className="error">
          {error}
        </p>
        <p role="status" className="success">
          {status}
        </p>
        {copiedCode && (
          <label>
            รหัสรับไฟล์
            <input
              readOnly
              value={grouped(copiedCode)}
              onFocus={(e) => e.target.select()}
            />
          </label>
        )}
        {!items.length && !busy && !error ? (
          <div className="empty-state">
            <span aria-hidden="true">[ ]</span>
            <h3>ยังไม่มีไฟล์จากเบราว์เซอร์นี้</h3>
            <p className="muted">ไฟล์ที่คุณอัปโหลดจะแสดงที่นี่</p>
          </div>
        ) : (
          <div className="file-list">
            {items.map((file) => {
              const expired =
                !!file.expiresAt && Date.parse(file.expiresAt) <= Date.now();
              const ready = file.state === "ready" && !expired;
              return (
                <article className="file-row" key={file.id}>
                  <div className="file-icon" aria-hidden="true">
                    ▤
                  </div>
                  <div className="file-info">
                    <h3>{file.name}</h3>
                    <p>
                      {file.shareMode === "multiple"
                        ? "หลายผู้รับ"
                        : file.claimedAt
                          ? "ผู้รับเดียว · มีผู้รับแล้ว"
                          : "ผู้รับเดียว · ยังไม่มีผู้รับ"}
                    </p>
                    <p>
                      {bytes(file.sizeBytes)} <span>·</span>{" "}
                      {date(file.expiresAt)}
                    </p>
                    <span className={`badge ${ready ? "ready" : ""}`}>
                      {expired
                        ? "หมดอายุ"
                        : {
                            ready: "พร้อมรับไฟล์",
                            uploading: "กำลังอัปโหลด",
                            allocating: "กำลังเตรียม",
                            finalizing: "กำลังตรวจสอบ",
                            deleting: "รอลบและคืนพื้นที่",
                            deleted: "ลบแล้ว",
                          }[file.state]}
                    </span>
                  </div>
                  <div className="file-actions">
                    {ready && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              const { code } = await api<{ code: string }>(
                                `/transfers/${file.id}/code`,
                                { method: "POST", body: {} },
                              );
                              setCopiedCode(code);
                              setStatus(
                                (await copy(code))
                                  ? "คัดลอกรหัสแล้ว"
                                  : "เลือกรหัสด้านบนเพื่อคัดลอกได้",
                              );
                            })
                          }
                        >
                          คัดลอกรหัส
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            setEditing(file);
                            setRetention(file.retention);
                          }}
                        >
                          เปลี่ยนอายุ
                        </button>
                      </>
                    )}
                    {file.state !== "deleting" && (
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => setRemoving(file)}
                      >
                        ลบ
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {busy && (
          <p role="status" className="muted">
            กำลังดำเนินการ…
          </p>
        )}
        {cursor && (
          <button disabled={busy} onClick={() => void load(cursor)}>
            แสดงเพิ่มเติม ↓
          </button>
        )}
        {removing && (
          <div
            className="confirm-box"
            role="dialog"
            aria-modal="false"
            aria-label="ยืนยันลบไฟล์"
          >
            <h3>ลบไฟล์นี้?</h3>
            <p className="filename">{removing.name}</p>
            <p className="muted">จะปิดรหัสทันที และคืนพื้นที่เมื่อระบบลบไฟล์สำเร็จ</p>
            <div className="actions">
              <button
                className="danger"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await api(`/transfers/${removing.id}`, {
                      method: "DELETE",
                    });
                    setRemoving(null);
                    setStatus("ส่งคำขอลบแล้ว ระบบกำลังคืนพื้นที่");
                  })
                }
              >
                ยืนยันลบ
              </button>
              <button disabled={busy} onClick={() => setRemoving(null)}>
                ยกเลิก
              </button>
            </div>
          </div>
        )}
        {editing && (
          <div
            className="confirm-box"
            role="dialog"
            aria-modal="false"
            aria-label="เปลี่ยนอายุไฟล์"
          >
            <h3>เปลี่ยนอายุไฟล์</h3>
            <p className="filename">{editing.name}</p>
            <label>
              เก็บไฟล์ไว้อีก
              <select
                value={retention}
                onChange={(e) => setRetention(e.target.value as Retention)}
              >
                {RETENTIONS.map((r) => (
                  <option key={r} value={r}>
                    {retentionLabels[r]}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">
              {retention === "forever"
                ? "ไฟล์จะใช้พื้นที่จนกว่าคุณจะลบเอง"
                : `วันหมดอายุใหม่โดยประมาณ: ${date(new Date(Date.now() + { "1h": 3600, "24h": 86400, "7d": 604800 }[retention] * 1000).toISOString())} (เริ่มนับเมื่อบันทึกสำเร็จ)`}
            </p>
            <div className="actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await api(`/transfers/${editing.id}`, {
                      method: "PATCH",
                      body: { retention },
                    });
                    setEditing(null);
                    setStatus("เปลี่ยนอายุไฟล์แล้ว");
                  })
                }
              >
                บันทึก
              </button>
              <button disabled={busy} onClick={() => setEditing(null)}>
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
