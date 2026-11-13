# TRANSFER

เว็บส่งไฟล์ข้ามเครื่อง **ไม่ต้องสมัครหรือล็อกอิน** ธีม terminal พร้อม System / Dark / Light

React + Vite + TypeScript · Hono/Cloudflare Workers · Private R2 · Supabase PostgreSQL

โฟลเดอร์นี้มีทั้ง frontend (`src/web`) และ backend (`src/worker`) deploy ด้วยกันเป็น Worker + Static Assets ใช้ APP_ORIGIN=auto สำหรับ production

## เริ่มใช้งาน

ใช้ Node.js >=22.18 แล้วตั้งค่า Worker ใน `.env` ตาม `.env.example` หน้าเว็บไม่ต้องมี VITE_SUPABASE_URL หรือ publishable key อีกแล้ว

```powershell
npm ci
npm run dev
```

เปิดหน้าเว็บเห็น Send ทันที ไม่มี login หาก Vite ย้าย port ให้อ่าน URL ที่ terminal แสดง ส่วน API ต้องเปิด Worker ด้วย:

```powershell
node --env-file=.env --run build
npm run dev:worker
```

dev:worker อ่าน .env ได้เอง (และอ่าน .dev.vars เมื่อมี) Vite proxy /api ไป127.0.0.1:8787 ตั้ง APP_ORIGIN ให้ตรงหน้าเว็บที่เปิดจริง เช่น http://localhost:5174; ใช้ APP_ORIGIN=auto เมื่อเปิด frontend+API ผ่าน Worker URL เดียวกันที่8787หรือproduction

## Migration ที่ต้องรัน

โปรเจกต์ใหม่รันตามลำดับใน Supabase SQL Editor:

1. `supabase/migrations/202611130001_transfer_core.sql`
2. `supabase/migrations/202611130002_anonymous_sharing.sql`

**หากรัน0001แล้ว ให้รันเฉพาะ0002เพิ่มเติม** ไม่ต้องสร้างบัญชีผู้ใช้/allowlist และห้ามรัน0001ซ้ำ แถวเก่ารุ่นloginไม่ถูกเปิดเผยให้ anonymous โดยอัตโนมัติ

## พฤติกรรม

- ไฟล์ละสูงสุด1GiB, พื้นที่stored+reservedรวม8GiB
- เลือกผู้รับเดียว (ค่าเริ่มต้น) หรือหลายผู้รับก่อนเริ่มส่ง
- ผู้รับเดียว: คนแรกกดรับสิทธิ์ได้ ดาวน์โหลดซ้ำได้จนไฟล์หมดอายุ การเปิดลิงก์/ค้นหารหัสไม่consume
- หลายผู้รับ: ทุกคนที่มีukidรับได้จนหมดอายุ
- อายุ1h/24h(default)/7d/จนกว่าจะลบเอง เริ่มหลังอัปโหลดสำเร็จ
- ลิงก์จัดการแยกจากรหัสรับไฟล์ ใช้ลบ/เปลี่ยนอายุเฉพาะรายการ อย่าส่งให้ผู้รับ
- ไฟล์บนเครื่องนี้เป็นประวัติlocal browser ไม่ใช่บัญชีออนไลน์ ล้างข้อมูลแล้วต้องใช้ลิงก์จัดการที่สำรองไว้
- สิทธิ์ผู้รับเดียวเก็บในsessionStorage ของtab เก็บtabไว้เพื่อดาวน์โหลดซ้ำ ไม่มีการยืนยันตัวบุคคลจริงหรือห้ามคัดลอกสิทธิ์ต่อ
- ไฟล์อยู่private R2; database RPCใช้service keyเฉพาะWorker ไม่มีSupabasekeyในbrowser
- Multipart16MiB/concurrency3 ใช้bounded proxyจนdirectuploadผ่านliveverification

## ตรวจงาน

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:runtime
npm run test:e2e
```

Chromeต้องติดตั้งอยู่ในเครื่อง; หากมีproxyให้ตั้งNO_PROXY=127.0.0.1,localhost

Live integrationแยกต่างหาก: `npm run test:integration` ต้องมีstagingenv ไม่ใช้ผลlocaltestsแทนผลSupabase/R2จริง

## เอกสาร

- [Spec v2](docs/superpowers/specs/2026-11-13-anonymous-sharing-design.md)
- [Handoff](docs/handoffs/2026-11-13-anonymous-sharing.md)
- [ตั้งบริการ](docs/runbooks/provider-setup.md)
- [Deploy](docs/runbooks/deploy.md)
- [Operations](docs/runbooks/operations.md)
- [Acceptance](docs/runbooks/acceptance.md)

ไม่มีantivirus/preview/E2EEในรุ่นนี้ โควตาของแอปไม่ใช่provider spending cap และSupabaseFreeอาจพักเมื่อidle
