# TRANSFER

เว็บส่งไฟล์ส่วนตัว/ภายในองค์กร ธีม terminal พร้อม System / Dark / Light

React + Vite + TypeScript · Hono บน Cloudflare Workers · Private R2 · Supabase Auth/PostgreSQL

## เริ่มในเครื่อง

ใช้ Node.js >=22.18 และ npm

```powershell
npm ci
Copy-Item .env.example .env.local
# .env.local ใส่เฉพาะ VITE_SUPABASE_URL และ VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

หากต้องการทดลองแค่ UI สามารถเปิดหน้า login ได้แม้ยังไม่ตั้งบัญชีจริง ส่วน flow ทดสอบ browser ใช้ API fixtures ซึ่งไม่ใช่ระบบเก็บไฟล์จริง

สำหรับใช้งานจริงในเครื่อง ตั้ง `.dev.vars` ตาม [คู่มือตั้งบริการ](docs/runbooks/provider-setup.md) แล้วเปิดสอง terminal:

```powershell
npm run build
npm run dev:worker
```

```powershell
npm run dev
```

หน้าเว็บอยู่ http://127.0.0.1:5173, API proxy ไป Worker ที่ port 8787; Worker ใช้ staging R2/Supabase จริง ไม่ใช่ storage จำลอง อัปเดต source Worker แล้ว build/restart อีกครั้ง

## ตรวจงาน

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:runtime
npm run test:e2e
```

Chrome ต้องติดตั้งอยู่ในเครื่อง (CI ติดตั้งด้วย Playwright); หากมี HTTP proxy ให้ตั้ง NO_PROXY=127.0.0.1,localhost เมื่อทดสอบ browser

`npm run test:integration` ต้องใช้ staging R2 credentials และ CORS จริง ถ้าไม่มีจะรายงาน BLOCKED และออกด้วยสถานะล้มเหลว ไม่ข้ามเงียบ ๆ

## ข้อกำหนดที่ใช้งาน

- หนึ่งไฟล์ต่อรายการ สูงสุด 1 GiB; พื้นที่ stored + reserved เริ่มต้น 8 GiB
- เก็บ 1 ชั่วโมง / 24 ชั่วโมง (default) / 7 วัน / จนกว่าจะลบเอง
- บัญชีที่อยู่ใน allowlist เท่านั้น การรับไฟล์ต้องมี ukid ด้วย ยกเว้นเจ้าของ
- อัปโหลดแบบ multipart 16 MiB ไม่เกิน 3 ส่วนพร้อมกัน
- รุ่นเริ่มต้นใช้ bounded streaming proxy; direct upload ปิดจนยืนยัน R2 signature/size enforcement จริง
- ไฟล์และรหัสพร้อมหลังตรวจอัปโหลดครบแล้ว ปิดเครื่องต้นทางได้
- รหัสหมดอายุทันทีตาม server time; พื้นที่คืนเมื่องานลบสำเร็จจริง กรณี provider response กำกวมอาจ pending ถึง 24 ชั่วโมง
- ไม่ทำ preview/execute ไฟล์ ไม่มี antivirus หรือ E2EE ในรุ่นนี้

## เอกสาร

- [Spec](docs/superpowers/specs/2026-11-13-file-transfer-design.md)
- [แผนพัฒนา](docs/superpowers/plans/2026-11-13-file-transfer.md)
- [ค่าตั้งบริการ](docs/runbooks/provider-setup.md)
- [Deploy](docs/runbooks/deploy.md)
- [Operations](docs/runbooks/operations.md)
- [ผลตรวจและงานที่ยังต้องยืนยัน](docs/runbooks/acceptance.md)

การทดสอบในเครื่องไม่ใช่หลักฐานว่า production credentials, region, billing และสิทธิ์ของบริการจริงถูกต้อง ต้องผ่าน staging ก่อน deploy
