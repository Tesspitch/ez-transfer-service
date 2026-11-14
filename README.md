# EZ-TRANSFER

เว็บส่งไฟล์ข้ามเครื่องโดยไม่ต้องสมัครสมาชิกหรือล็อกอิน เลือกไฟล์จากเครื่อง A แล้วส่งรหัสหรือลิงก์ให้เครื่อง B ดาวน์โหลด รองรับหลายไฟล์ ธีม Terminal แบบ System / Dark / Light และแถบหัวเว็บแบบ sticky

## วิธีใช้งาน

### ส่งไฟล์

1. เปิดเว็บแล้วเลือกเมนู **ส่งไฟล์**
2. คลิกเลือกไฟล์ ลากไฟล์มาวาง หรือวางไฟล์จากคลิปบอร์ด สามารถเพิ่มไฟล์ต่อจากรายการเดิมได้
3. ติ๊กเลือกเฉพาะไฟล์ที่จะส่ง เอาติ๊กออกเพื่อไม่ส่งไฟล์นั้น หรือกด `×` เพื่อลบออกจากรายการ สามารถเลือกทั้งหมด เอาเครื่องหมายออกทั้งหมด ลบไฟล์ที่ไม่ได้เลือก และล้างรายการได้
4. เลือก **ผู้รับเดียว** หรือ **หลายผู้รับ** และกำหนดอายุไฟล์
5. กด **อัปโหลดไฟล์** แล้วรอจนแสดงว่าสำเร็จ อย่าปิดหน้าหรือรีเฟรชระหว่างเตรียม ZIP และอัปโหลด
6. คัดลอก **รหัสรับไฟล์** หรือ **ลิงก์รับไฟล์** ส่งให้ปลายทาง
7. เก็บ **ลิงก์จัดการไฟล์** ไว้สำหรับลบหรือเปลี่ยนอายุไฟล์ด้วยตนเอง

เลือกหนึ่งไฟล์จะส่งไฟล์ต้นฉบับ เลือกตั้งแต่สองไฟล์ขึ้นไปจะรวมเป็น ZIP แบบไม่บีบอัด ผู้รับดาวน์โหลดทั้งชุดด้วยรหัสเดียว ไฟล์ต้นฉบับในเครื่องผู้ส่งจะไม่ถูกลบ เมื่ออัปโหลดสำเร็จแล้วสามารถปิดเครื่องผู้ส่งได้

### รับไฟล์

- **รับผ่านลิงก์:** เปิดลิงก์แล้วระบบจะไปหน้ารับไฟล์และค้นหาไฟล์ให้ทันที จากนั้นกดดาวน์โหลด
- **รับผ่านรหัส:** เปิดเมนู **รับไฟล์** วางรหัส แล้วกด **ค้นหาไฟล์** จากนั้นกดดาวน์โหลด
- หากได้รับ ZIP ให้แตกไฟล์หลังดาวน์โหลดเพื่อใช้งานไฟล์ข้างใน

ตัวอย่างลิงก์รับไฟล์:

```text
https://your-domain.example/receive#code=UKID
```

การเปิดลิงก์หรือค้นหารหัสยังไม่ถือว่าได้รับสิทธิ์ในโหมดผู้รับเดียว ต้องกด **รับสิทธิ์และดาวน์โหลด** ก่อน ระบบไม่เริ่มดาวน์โหลดอัตโนมัติเมื่อเปิดลิงก์

### เลือกโหมดผู้รับ

| โหมด | พฤติกรรม |
| --- | --- |
| ผู้รับเดียว — ค่าเริ่มต้น | เบราว์เซอร์ที่กดรับสิทธิ์สำเร็จเป็นรายแรกจะดาวน์โหลดได้ และดาวน์โหลดซ้ำได้จนไฟล์หมดอายุ |
| หลายผู้รับ | ทุกคนที่มีรหัสหรือลิงก์รับไฟล์ดาวน์โหลดได้จนไฟล์หมดอายุ |

โหมดผู้รับเดียวใช้สิทธิ์ที่บันทึกใน `sessionStorage` ของแท็บ ไม่ใช่การยืนยันตัวบุคคล ให้เก็บแท็บนั้นไว้เพื่อดาวน์โหลดซ้ำ ไม่สามารถเปลี่ยนโหมดผู้รับหลังเริ่มส่งไฟล์

### อายุและขนาดไฟล์

| รายการ | ค่าปัจจุบัน |
| --- | --- |
| อายุไฟล์ | 1 ชั่วโมง / 24 ชั่วโมง (ค่าเริ่มต้น) / 7 วัน / จนกว่าจะลบเอง |
| เริ่มนับอายุ | เมื่ออัปโหลดสำเร็จ |
| จำนวนไฟล์ในรายการ | สูงสุด 100 ไฟล์ต่อชุด |
| ขนาดที่ส่ง | ไฟล์เดี่ยวหรือ ZIP รวมข้อมูลกำกับต้องไม่เกิน 1 GiB |
| พื้นที่รวมของแอป | 8 GiB รวมพื้นที่ที่เก็บแล้วและจองไว้สำหรับการอัปโหลด |
| ไฟล์ว่าง | ไม่รองรับไฟล์ขนาด 0 ไบต์ |

เมื่อหมดอายุจะรับไฟล์ไม่ได้ และงาน cleanup จะลบข้อมูลออกจาก storage เบื้องหลัง การคืนพื้นที่อาจไม่เกิดทันทีหากผู้ให้บริการขัดข้อง ไฟล์ที่เลือกเก็บจนกว่าจะลบเองยังใช้พื้นที่จนกว่าจะถูกลบ

### จัดการไฟล์และเปลี่ยนธีม

- เมนู **ไฟล์บนเครื่องนี้** แสดงรายการที่ส่งจากเบราว์เซอร์นี้ ใช้คัดลอกรหัส เปลี่ยนอายุ และลบไฟล์ได้
- ประวัติและสิทธิ์จัดการบันทึกในเบราว์เซอร์ หากเปลี่ยนเครื่อง ล้างข้อมูล หรือใช้โหมดส่วนตัว รายการอาจไม่ตามไปด้วย ให้สำรองลิงก์จัดการไว้
- ลิงก์จัดการให้สิทธิ์ลบและเปลี่ยนอายุไฟล์ **อย่าส่งให้ผู้รับ** รหัสรับไฟล์ไม่สามารถใช้กู้สิทธิ์จัดการได้
- เลือกธีมที่มุมขวาบน: **System** ตามระบบปฏิบัติการ, **Dark** หรือ **Light** ระบบจดจำค่าบนเบราว์เซอร์ที่อนุญาตให้บันทึกข้อมูล

## โครงสร้างและ stack

โปรเจกต์นี้มี frontend และ backend ใน **repo เดียว** และ deploy พร้อมกันเป็น **Cloudflare Worker + Static Assets** หน้าเว็บกับ `/api/*` ใช้โดเมนเดียวกัน ไม่ต้องแยก repo หรือ deploy หน้าเว็บก่อนเพื่อหา URL

| ส่วน | เทคโนโลยี |
| --- | --- |
| Frontend | React, Vite, TypeScript |
| Backend | Hono, Cloudflare Workers |
| เก็บไฟล์ | Private Cloudflare R2 |
| ฐานข้อมูล | Supabase PostgreSQL ใช้เฉพาะฝั่ง backend |
| รวมไฟล์ | zip.js ทำ ZIP บนเบราว์เซอร์ผู้ส่ง |

```text
src/web/                 หน้าเว็บ
src/worker/              API และงาน cleanup
src/shared/              types และ validation
public/brand/            โลโก้ SVG
supabase/migrations/     migration ฐานข้อมูล
scripts/                 build และตรวจ runtime
cloudflare.config.ts     ตั้งค่า Worker
```

## ตั้งค่าก่อนรัน

ใช้ Node.js **22.18 ขึ้นไป**, npm, Supabase project และ R2 private bucket ที่พร้อมใช้งาน

```powershell
npm ci
if (-not (Test-Path -LiteralPath .env)) {
  Copy-Item .env.example .env
}
```

คำสั่งคัดลอกใช้เมื่อยังไม่มี `.env` เท่านั้น หากตั้งค่าไว้แล้วให้ใช้ไฟล์เดิม

กรอกค่าตามตารางใน `.env`:

| ตัวแปร | ใช้ทำอะไร |
| --- | --- |
| `SUPABASE_URL` | URL ของ Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend key สำหรับเข้าถึงฐานข้อมูล รองรับ service role key เดิมหรือ secret key แบบใหม่ตาม setup |
| `R2_ACCOUNT_ID` | Cloudflare account ID ที่มี bucket |
| `R2_BUCKET` | ชื่อ private bucket จริง |
| `R2_ACCESS_KEY_ID` | Access key ที่มีสิทธิ์ใช้งาน bucket |
| `R2_SECRET_ACCESS_KEY` | Secret ของ R2 access key |
| `SHARE_CODE_KEYS` | JSON map ของ key version สำหรับเข้ารหัสรหัสรับไฟล์ เช่น `{"v1":"BASE64_KEY"}` |
| `SHARE_CODE_ACTIVE_KEY` | รุ่น key ที่ใช้สร้างรหัสใหม่ เช่น `v1` |
| `APP_ORIGIN` | Origin ของหน้าเว็บ หรือ `auto` เมื่อหน้าเว็บและ API อยู่ origin เดียวกัน |
| `DIRECT_UPLOAD_VERIFIED` | คง `false` จนกว่าจะผ่านการทดสอบ direct upload จริงตาม runbook |

`SHARE_CODE_KEYS` เป็น key ของระบบที่สร้างตอนติดตั้ง ไม่ใช่ UKID ที่ได้หลังส่งไฟล์ สร้างค่า Base64 ครั้งแรกได้ด้วย:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

นำผลลัพธ์ใส่ใน `.env` แบบนี้:

```dotenv
SHARE_CODE_KEYS='{"v1":"วางค่า Base64 ที่สร้างได้"}'
SHARE_CODE_ACTIVE_KEY=v1
```

หากมี key อยู่แล้วให้ใช้ค่าเดิม อย่าสร้างทับ key ที่ใช้กับไฟล์เดิม ต้องเก็บ key รุ่นเก่าไว้เมื่อต้องการหมุนเวียน key หน้าเว็บไม่ต้องใช้ `VITE_SUPABASE_*` และห้ามใส่ backend secrets ในตัวแปรที่ขึ้นต้นด้วย `VITE_`

### รัน migration

เปิด Supabase SQL Editor แล้วรันตามลำดับ:

1. [0001 — ฐานข้อมูลเริ่มต้น](supabase/migrations/202611130001_transfer_core.sql)
2. [0002 — ไม่ล็อกอินและเลือกโหมดผู้รับ](supabase/migrations/202611130002_anonymous_sharing.sql)

ถ้ารัน 0001 แล้ว ให้รันเฉพาะ 0002 ที่ยังไม่ได้รัน ไม่ต้องสร้างบัญชีผู้ใช้หรือ allowlist แถวข้อมูลรุ่นล็อกอินเดิมจะไม่ถูกเปิดให้ anonymous โดยอัตโนมัติ

## รันบนเครื่องพัฒนา

ตั้ง `.env` ให้ตรงกับ origin ของหน้าเว็บ เช่น `APP_ORIGIN=http://127.0.0.1:5173`

เปิด terminal แรกเพื่อ build และเปิด backend:

```powershell
node --env-file=.env --run build
npm run dev:worker
```

เปิด terminal ที่สองในโฟลเดอร์เดียวกันเพื่อเปิด frontend:

```powershell
npm run dev
```

เปิด URL ที่ Vite แสดง โดยปกติคือ `http://127.0.0.1:5173` Vite จะ proxy `/api` ไป Worker ที่ `127.0.0.1:8787` หาก Vite เปลี่ยนพอร์ตหรือเปิดด้วย `localhost` ให้แก้ `APP_ORIGIN` ให้ตรง แล้วรีสตาร์ต Worker

`dev:worker` อ่าน `.env` และ `.dev.vars` หากมี เมื่อแก้โค้ด backend ต้อง build และรีสตาร์ต Worker ส่วนการแก้ frontend ผ่าน Vite จะอัปเดตอัตโนมัติ การรัน local นี้เชื่อม Supabase/R2 ตามค่าจริงใน env จึงควรใช้ทรัพยากรสำหรับพัฒนาแยกจาก production

## Deploy ไป Cloudflare

ใช้โฟลเดอร์ root เดียวกัน deploy เป็น **Workers + Static Assets** ไม่ใช่อัปโหลดเฉพาะ `dist/client` เข้า Pages

### 1. ล็อกอิน

```powershell
npx cf auth login
npx cf auth whoami
```

อนุญาตผ่านเบราว์เซอร์ และเลือกบัญชี Cloudflare ที่มี R2 ของคุณ

### 2. เตรียม secrets

รันบล็อกนี้ใน PowerShell จากโฟลเดอร์โปรเจกต์ เพื่ออ่านค่าที่มีอยู่ใน `.env` และสร้างไฟล์ secrets โดยไม่แสดงค่าออกหน้าจอ:

```powershell
@'
import { writeFileSync } from "node:fs";

const names = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "SHARE_CODE_KEYS"
];

for (const name of names) {
  if (!process.env[name]) throw new Error("Missing: " + name);
}

writeFileSync(
  ".env.worker-secrets.json",
  JSON.stringify(Object.fromEntries(names.map(name => [name, process.env[name]])), null, 2)
);

console.log("สร้างไฟล์ secrets แล้ว");
'@ | node --env-file=.env --input-type=module
```

`.env` และ `.env.worker-secrets.json` ถูก `.gitignore` กันไว้ ห้าม commit หรือเผยแพร่ไฟล์เหล่านี้ หากเปลี่ยน secrets ใน `.env` ต้องสร้างไฟล์นี้ใหม่ก่อน deploy

### 3. Build และตรวจแบบไม่อัปโหลด

รันในหน้าต่าง PowerShell เดิม:

```powershell
$env:APP_ORIGIN="auto"
$env:TRANSFER_MODE="production"
node --env-file=.env --run build
npx cf deploy --prebuilt --mode production --dry-run
```

`APP_ORIGIN=auto` ใช้ origin จาก request จริง ไม่ต้องทราบ URL ก่อน deploy ค่าที่ตั้งใน PowerShell นี้ไม่แก้ไฟล์ `.env` หลังจบงานให้เปิด terminal ใหม่เมื่อต้องการกลับไปใช้ env สำหรับพัฒนา

### 4. Deploy จริง

เมื่อ dry-run ผ่านและตรวจทรัพยากรพร้อมแล้ว:

```powershell
npx cf deploy --prebuilt --mode production --secrets-file .env.worker-secrets.json
```

CLI จะแสดง URL ที่เปิดใช้งานได้ หน้าเว็บและ API ขึ้นพร้อมกัน ส่วน Supabase/R2 ใช้บริการที่เตรียมไว้ ไม่ได้ถูกสร้างโดยคำสั่ง deploy นี้

ชื่อ Worker ใน `cloudflare.config.ts` ปัจจุบันยังเป็น `terminal-transfer` ชื่อที่แสดงบนเว็บคือ **EZ-TRANSFER** หากต้องการเปลี่ยนชื่อทรัพยากร Worker ให้กำหนดก่อน deploy ครั้งแรก

เปิดเว็บ production แล้วลองส่งไฟล์เล็กจากเครื่อง A เปิดลิงก์บนเครื่อง B ดาวน์โหลดและตรวจเนื้อหา จากนั้นลองลบผ่านลิงก์จัดการ ก่อนใช้งานจริงเพิ่มเติมให้ตรวจตาม [Acceptance](docs/runbooks/acceptance.md)

### Git และการอัปเดต

Push source code, migrations, scripts, assets และ `package-lock.json` เข้า **repo เดียว** ได้ ใช้ `.gitignore` เดิมเพื่อไม่ส่ง secrets, dependencies และ build output การ push อย่างเดียวยังไม่ deploy อัตโนมัติ ต้องตั้ง CI/CD เพิ่ม

เมื่อแก้ระบบแล้ว ให้ build, dry-run และ deploy ตามขั้นตอนเดิม สามารถตั้ง GitHub Actions ภายหลัง โดยเก็บ credentials ใน GitHub Secrets แทนการ commit `.env`

## ตรวจสอบและแก้ปัญหา

| อาการ | ตรวจอะไร |
| --- | --- |
| หน้าเว็บเปิดได้ แต่ส่ง/รับไม่ได้ | เปิด Worker แล้วหรือยัง, env ถูกต้องหรือไม่ และใช้ migration 0002 แล้วหรือยัง |
| Origin ถูกปฏิเสธขณะรัน local | `APP_ORIGIN` ต้องตรง scheme/host/port ของหน้าเว็บ แล้วรีสตาร์ต Worker |
| ไม่พบ `transfer_rpc_v2` | ตรวจ migration 0002 ใน Supabase project ที่ env ชี้อยู่ |
| ไม่พบไฟล์หรือรหัสหมดอายุ | ตรวจรหัส ลิงก์ อายุไฟล์ และว่าเจ้าของลบแล้วหรือไม่ |
| ไฟล์นี้มีผู้รับแล้ว | โหมดผู้รับเดียวมีเบราว์เซอร์อื่นรับสิทธิ์ไปแล้ว |
| ดาวน์โหลดไม่สำเร็จหลังรับสิทธิ์ | เก็บแท็บเดิมไว้แล้วลองดาวน์โหลดอีกครั้ง |
| รายการไฟล์หายเมื่อเปลี่ยนเครื่อง | ประวัติอยู่ใน browser เดิม ใช้ลิงก์จัดการที่สำรองไว้ |
| ขนาดเกิน 1 GiB | เอาติ๊กบางไฟล์ออก ZIP มีข้อมูลกำกับเพิ่มจากผลรวมขนาดไฟล์ด้วย |

คำสั่งตรวจงานสำหรับผู้พัฒนา:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:runtime
npm run test:e2e
```

Browser tests ใช้ Chrome ที่ติดตั้งในเครื่อง หากมี proxy ให้ตั้ง `$env:NO_PROXY="127.0.0.1,localhost"` ส่วน `npm run test:integration` ต้องตั้ง staging env เพิ่ม ผลทดสอบ local ไม่ยืนยันการทำงานจริงของ Supabase/R2 และ ZIP ขนาดเต็ม 1 GiB บนอุปกรณ์จริงยังต้องทดสอบเพิ่มเติม

รุ่นนี้ไม่มี antivirus, preview หรือ end-to-end encryption ผู้ที่มีลิงก์หรือรหัสสามารถขอรับไฟล์ตามโหมดที่เลือกได้ ระบบไม่มีบัญชีสำหรับกู้สิทธิ์ที่สูญหาย

## เอกสารเพิ่มเติม

- [ตั้งค่า Supabase และ R2](docs/runbooks/provider-setup.md)
- [Deploy และ rollback](docs/runbooks/deploy.md)
- [Operations และ cleanup](docs/runbooks/operations.md)
- [Acceptance ก่อนใช้งานจริง](docs/runbooks/acceptance.md)
- [Spec ไม่ล็อกอินและโหมดผู้รับ](docs/superpowers/specs/2026-11-13-anonymous-sharing-design.md)
- [Spec หลายไฟล์](docs/superpowers/specs/2026-11-13-multi-file-selection.md)
- [Handoff หลายไฟล์](docs/handoffs/2026-11-14-multi-file-selection.md)
- [ตัวอย่างโลโก้](docs/brand/ez-transfer-preview.png)
