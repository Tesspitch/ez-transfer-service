# Provider setup

## Supabase

สร้าง staging project และ production project แยกกัน เลือก region ตามข้อกำหนดข้อมูลขององค์กร เปิด asymmetric JWT signing key (ES256/RS256) ใน Auth เพื่อให้ Worker ตรวจผ่าน JWKS ได้

1. รัน SQL ใน `supabase/migrations/202611130001_transfer_core.sql` ผ่าน SQL Editor บนโปรเจกต์เป้าหมายครั้งเดียว Migration เป็น atomic transaction ถ้าล้มเหลวอย่ารันแก้เฉพาะบางบรรทัด
2. ปิด public sign-ups ใน Auth settings ไม่มีหน้า signup ในแอป
3. ผู้ดูแลสร้างบัญชี email/password ผ่าน Dashboard และส่งข้อมูลเข้าระบบผ่านช่องทางภายในที่เหมาะสม
4. เพิ่มบัญชีลง allowlist ผ่าน SQL Editor (แทน UUID ก่อนรัน):

```sql
insert into tt.members(user_id,role)
values('USER_UUID_FROM_AUTH_DASHBOARD','admin');
-- คนอื่นใช้ role 'member'
```

ปิดบัญชีด้วย `update tt.members set active=false where user_id='USER_UUID';` มีผล API ถัดไปแม้ JWT ยังไม่หมดอายุ ลิงก์ดาวน์โหลดที่ออกแล้วอาจยังใช้ได้ช่วงสั้น ๆ จนหมดอายุ/ลบ object

เก็บ URL, publishable key สำหรับ frontend; service_role key ใช้เฉพาะ Worker ห้ามใส่ VITE_ หรือ commit ส่วน schema tt และ RPC ถูก revoke จาก anon/authenticated ใน migration แล้ว ไม่ต้องเปิด schema tt ผ่าน PostgREST

## R2

สร้าง bucket ชื่อ `terminal-transfer-staging` และ `terminal-transfer-production` แบบ Standard; ปิด public access/custom public domain/r2.dev; สร้าง S3 API token ที่จำกัด object read/write เฉพาะ bucket เป้าหมาย (ต้อง list multipart ได้ด้วย)

ตั้ง lifecycle abort incomplete multipart หลัง 1 วันเท่านั้น **อย่าตั้ง delete rule ครอบคลุม transfers/** เพราะมีไฟล์ forever

หากเปิด direct upload ในภายหลัง ให้ตั้ง CORS GET/PUT เฉพาะ frontend origin, allowed Content-Type, expose ETag ตัวอย่าง staging:

```json
[
  {
    "AllowedOrigins": ["http://127.0.0.1:5173", "https://transfer-staging.example.test"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

แทน staging test origin ด้วย origin ทดสอบตาม test หรือคงไว้เฉพาะ staging; production ใช้โดเมนจริงของแอปเท่านั้น CORS ไม่ใช่ตัวตรวจสิทธิ์ bucket ยังคง private เสมอ

## Local environment

สร้าง `.env.local` มีแค่ public frontend values และ `.dev.vars` มีค่าด้านล่าง สองไฟล์ถูก gitignore ห้ามส่ง secrets ผ่านแชตหรือเก็บในเอกสาร:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
R2_ACCOUNT_ID=YOUR_ACCOUNT_ID
R2_BUCKET=terminal-transfer-staging
R2_ACCESS_KEY_ID=YOUR_BUCKET_SCOPED_KEY
R2_SECRET_ACCESS_KEY=YOUR_BUCKET_SCOPED_SECRET
SHARE_CODE_KEYS='{"v1":"BASE64_32_RANDOM_BYTES"}'
SHARE_CODE_ACTIVE_KEY=v1
APP_ORIGIN=http://127.0.0.1:5173
DIRECT_UPLOAD_VERIFIED=false
```

สร้าง encryption key 32 random bytes ด้วย Node crypto แล้วบันทึกลงไฟล์ secrets ที่ปลอดภัย ห้ามใส่ key จริงใน source/logs การหมุน key ต้องเก็บรุ่นเก่าไว้ใน SHARE_CODE_KEYS เพื่ออ่านรหัสไฟล์เก่าได้

R2 free usage ไม่ใช่ hard spending cap ตรวจ billing activation/payment requirement ที่บัญชีจริงก่อนเปิดใช้ ตั้ง budget alert ที่ Cloudflare/Supabase และให้ policy ขององค์กรอนุญาตข้อมูลขึ้น cloud ก่อนใช้งาน
