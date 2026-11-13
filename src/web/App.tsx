import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { authClient } from "./lib/auth";
import { api } from "./lib/api";
import { bytes } from "./lib/format";
import { applyTheme, storedTheme, type Theme } from "./theme";
import { Login } from "./features/auth/Login";
import { Send } from "./features/send/Send";
import { Receive } from "./features/receive/Receive";
import { MyFiles } from "./features/files/MyFiles";
import type { Budget } from "../shared/contracts";
const initialCode =
  new URLSearchParams(location.hash.slice(1)).get("code") ?? "";
if (location.hash)
  history.replaceState(null, "", location.pathname + location.search);
type Tab = "send" | "receive" | "files";
export function App() {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!authClient);
  const [tab, setTab] = useState<Tab>(
    location.pathname === "/receive" ? "receive" : "send",
  );
  const [budget, setBudget] = useState<Budget | null>(null);
  const [memberError, setMemberError] = useState("");
  useEffect(() => {
    applyTheme(theme);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      if (theme === "system") applyTheme("system");
    };
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [theme]);
  useEffect(() => {
    if (!authClient) return;
    let active = true;
    void authClient.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setSession(data.session);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    const { data } = authClient.auth.onAuthStateChange((_event, s) => {
      if (active) {
        setSession(s);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const refresh = () => {
    if (session)
      void api<{ budget: Budget }>("/me")
        .then((r) => {
          setBudget(r.budget);
          setMemberError("");
        })
        .catch((e) => {
          setBudget(null);
          setMemberError(e instanceof Error ? e.message : "ระบบยังไม่พร้อม");
        });
  };
  useEffect(() => {
    refresh();
  }, [session]); // membership is rechecked server-side for every request
  const navigate = (next: Tab) => {
    setTab(next);
    history.replaceState(null, "", next === "send" ? "/" : "/" + next);
  };
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="TRANSFER หน้าแรก">
          <span className="brand-mark" aria-hidden="true">
            &gt;_
          </span>
          <span>
            TRANSFER<span className="brand-dot">.</span>
          </span>
          <span className="version">v.01</span>
        </a>
        <div className="header-right">
          <span className="private-label">
            <span aria-hidden="true">◆</span> PRIVATE WORKSPACE
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
          {session && (
            <button
              className="logout"
              onClick={() => void authClient!.auth.signOut()}
            >
              ออกจากระบบ
            </button>
          )}
        </div>
      </header>
      <main>
        {loading ? (
          <div className="loading" role="status">
            กำลังเปิดพื้นที่ส่งไฟล์…
          </div>
        ) : !session ? (
          <Login />
        ) : (
          <>
            <div className="workspace-heading">
              <div>
                <p className="eyebrow">YOUR PRIVATE WORKSPACE</p>
                <h1>
                  ย้ายไฟล์ ให้งานเดินต่อ<span className="brand-dot">_</span>
                </h1>
              </div>
              <span className="account-name">{session.user.email}</span>
            </div>
            <div className="workspace-toolbar">
              <nav aria-label="เมนูหลัก">
                {(["send", "receive", "files"] as const).map((value, i) => (
                  <button
                    key={value}
                    aria-current={tab === value ? "page" : undefined}
                    className={tab === value ? "active" : ""}
                    onClick={() => navigate(value)}
                  >
                    <span className="nav-index">0{i + 1}</span>{" "}
                    {value === "send"
                      ? "ส่งไฟล์"
                      : value === "receive"
                        ? "รับไฟล์"
                        : "ไฟล์ของฉัน"}
                  </button>
                ))}
              </nav>
              {budget && (
                <div className="storage-summary">
                  <span className="status-dot" />
                  <span>
                    {bytes(budget.stored_bytes + budget.reserved_bytes)} /{" "}
                    {bytes(budget.limit_bytes)}
                  </span>
                  <span className="dim">ใช้งานอยู่</span>
                </div>
              )}
            </div>
            {memberError ? (
              <section className="panel panel-body">
                <p role="alert" className="error">
                  {memberError}
                </p>
                <button onClick={refresh}>ลองเชื่อมต่อใหม่</button>
              </section>
            ) : tab === "send" ? (
              <Send onChanged={refresh} />
            ) : tab === "receive" ? (
              <Receive initialCode={initialCode} />
            ) : (
              <MyFiles onChanged={refresh} />
            )}
          </>
        )}
      </main>
      <footer>
        <span>
          <span className="status-dot" /> FILES MOVE. WORK CONTINUES.
        </span>
        <span>ส่งอย่างเรียบง่าย · รับอย่างเป็นส่วนตัว</span>
      </footer>
    </div>
  );
}
