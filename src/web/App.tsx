import { useEffect, useState } from "react";
import { applyTheme, storedTheme, type Theme } from "./theme";
import { Send } from "./features/send/Send";
import { Receive } from "./features/receive/Receive";
import { MyFiles } from "./features/files/MyFiles";
import { rememberTransfer } from "./lib/local-transfers";
import { api } from "./lib/api";
const fragment = new URLSearchParams(location.hash.slice(1));
const initialCode = fragment.get("code") ?? "";
let managementCandidate: { id: string; ownerToken: string } | null = null;
if (location.pathname === "/manage") {
  const id = fragment.get("id"),
    ownerToken = fragment.get("owner");
  if (
    id &&
    ownerToken &&
    /^[A-Za-z0-9_-]{43}$/.test(ownerToken) &&
    /^[0-9a-f-]{36}$/i.test(id)
  )
    managementCandidate = { id, ownerToken };
}
if (location.hash)
  history.replaceState(null, "", location.pathname + location.search);
type Tab = "send" | "receive" | "files";
export function App() {
  const [managementPending, setManagementPending] =
    useState(!!managementCandidate);
  const [managementError, setManagementError] = useState("");
  useEffect(() => {
    const candidate = managementCandidate;
    if (!candidate) return;
    void api(`/transfers/${candidate.id}`, {
      headers: { "X-Transfer-Owner-Token": candidate.ownerToken },
    })
      .then(() => {
        rememberTransfer({ ...candidate, createdAt: new Date().toISOString() });
      })
      .catch(() =>
        setManagementError("ลิงก์จัดการไม่ถูกต้องหรือไฟล์ไม่พร้อมใช้งาน ประวัติเดิมยังอยู่"),
      )
      .finally(() => setManagementPending(false));
  }, []);
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const [tab, setTab] = useState<Tab>(
    location.pathname === "/receive"
      ? "receive"
      : ["/files", "/manage"].includes(location.pathname)
        ? "files"
        : "send",
  );
  useEffect(() => {
    applyTheme(theme);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      if (theme === "system") applyTheme("system");
    };
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [theme]);
  const navigate = (next: Tab) => {
    setTab(next);
    history.replaceState(null, "", next === "send" ? "/" : "/" + next);
  };
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="EZ-TRANSFER หน้าแรก">
          <svg
            className="brand-mark"
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
          >
            <g
              stroke="currentColor"
              strokeWidth="2.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M37 16 26 5H12a3 3 0 0 0-3 3v32a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3v-5M26 5v11h11" />
              <path d="M18 25h23m-7-7 7 7-7 7M17 34h7" />
            </g>
          </svg>
          <span>
            EZ-TRANSFER<span className="brand-dot">.</span>
          </span>
          <span className="version">v.02</span>
        </a>
        <div className="header-right">
          <span className="private-label">
            <span aria-hidden="true">◆</span> FILE TRANSFER
          </span>
          <label className="theme-control">
            <span className="visually-hidden">ธีม</span>
            <select
              aria-label="ธีม"
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
            >
              <option value="system">◐ System</option>
              <option value="dark">☾ Dark</option>
              <option value="light">☀ Light</option>
            </select>
          </label>
        </div>
      </header>
      <main>
        {managementError && (
          <p className="error" role="alert">
            {managementError}
          </p>
        )}
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">SEND. SHARE. CONTINUE.</p>
            <h1>
              ย้ายไฟล์ ให้งานเดินต่อ<span className="brand-dot">_</span>
            </h1>
          </div>
          <span className="account-name">เปิดเว็บ แล้วส่งได้เลย</span>
        </div>
        <div className="workspace-toolbar">
          <nav aria-label="เมนูหลัก">
            {(["send", "receive", "files"] as const).map((value) => (
              <button
                key={value}
                aria-current={tab === value ? "page" : undefined}
                className={tab === value ? "active" : ""}
                onClick={() => navigate(value)}
              >
                {value === "send"
                  ? "ส่งไฟล์"
                  : value === "receive"
                    ? "รับไฟล์"
                    : "ไฟล์บนเครื่องนี้"}
              </button>
            ))}
          </nav>
          <span className="storage-summary">
            <span className="status-dot" />
            สูงสุด 1 GiB / ไฟล์
          </span>
        </div>
        {managementPending ? (
          <p role="status">กำลังตรวจลิงก์จัดการ…</p>
        ) : tab === "send" ? (
          <Send onChanged={() => {}} />
        ) : tab === "receive" ? (
          <Receive initialCode={initialCode} />
        ) : (
          <MyFiles onChanged={() => {}} />
        )}
      </main>
      <footer>
        <span>
          <span className="status-dot" /> FILES MOVE. WORK CONTINUES.
        </span>
        <span>ส่งอย่างเรียบง่าย · ไม่ต้องสมัครสมาชิก</span>
      </footer>
    </div>
  );
}
