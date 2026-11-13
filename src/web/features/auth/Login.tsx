import { useState } from "react";
import { authClient } from "../../lib/auth";
export function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="login-layout">
      <section className="intro">
        <p className="eyebrow">PRIVATE FILE TRANSFER / 01</p>
        <h1>
          ส่งจากเครื่องนี้
          <br />
          <span>
            รับได้ทุกเครื่อง<span className="cursor">_</span>
          </span>
        </h1>
        <p className="intro-copy">
          พื้นที่ส่งไฟล์ส่วนตัวสำหรับคุณและทีม
          <br />
          อัปโหลด คัดลอกรหัส แล้วไปรับต่อได้เลย
        </p>
        <div className="intro-line" />
        <div className="features">
          <span>
            <b>01</b> ไฟล์ใหญ่สูงสุด 1 GiB
          </span>
          <span>
            <b>02</b> กำหนดวันหมดอายุได้
          </span>
          <span>
            <b>03</b> เฉพาะบัญชีที่อนุญาต
          </span>
        </div>
      </section>
      <section className="panel login-panel">
        <div className="panel-top">
          <span className="window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>secure_session</span>
          <span className="dim">/ login</span>
        </div>
        <div className="panel-body">
          <p className="command">
            <span>$</span> transfer login
          </p>
          <h2>เข้าสู่พื้นที่ส่งไฟล์</h2>
          <p className="muted">ใช้บัญชีที่ผู้ดูแลเปิดให้คุณ</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const data = new FormData(e.currentTarget);
              if (!authClient) {
                setError("ระบบยังไม่พร้อม กรุณาติดต่อผู้ดูแล");
                setBusy(false);
                return;
              }
              try {
                const { error } = await authClient.auth.signInWithPassword({
                  email: String(data.get("email")),
                  password: String(data.get("password")),
                });
                if (error) setError("เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบบัญชีและรหัสผ่าน");
              } catch {
                setError("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              อีเมล
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                required
              />
            </label>
            <label>
              รหัสผ่าน
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="กรอกรหัสผ่าน"
                required
              />
            </label>
            <button className="primary full" disabled={busy}>
              {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}{" "}
              <span aria-hidden="true">↗</span>
            </button>
            <p role="alert" className="error">
              {error}
            </p>
          </form>
          <div className="login-note">
            <span aria-hidden="true">⌁</span> พื้นที่นี้เปิดให้เฉพาะสมาชิกที่ได้รับอนุญาต
          </div>
        </div>
      </section>
    </div>
  );
}
