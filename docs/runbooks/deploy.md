# Deploy

## Build และตรวจ output

ใช้ Cloudflare cf CLI ที่ pin ใน package-lock.json ไม่สร้าง Wrangler config โปรเจกต์นี้มี custom packager ใช้ official @cloudflare/config + @cloudflare/build-output-utils เพราะ Vite plugin ที่ติดตั้งได้ขณะพัฒนาไม่รับ config .ts ตาม docs ใหม่ ใช้ `npm run build` และ `cf deploy --prebuilt` แทน `cf build`

1. ตั้ง public frontend env VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY สำหรับ environment เป้าหมาย
2. ตั้ง SUPABASE_URL, R2_ACCOUNT_ID, R2_BUCKET, APP_ORIGIN ใน process env ก่อน build ค่านี้ไม่ลับแต่ต้องตรง environment; ห้ามใช้ bucket production ใน staging
3. production: `npm run build`; staging: ตั้ง TRANSFER_MODE=staging แล้ว `npm run build`
4. Build จะเขียน `.cloudflare/output/v0/` พร้อม bundle, config และ static assets; packager ตรวจ schema กับ CLI libraries ที่ pin แล้ว ไม่เก็บ secret values ใน output
5. ตรวจ static `_headers` ให้ connect-src ใช้ Supabase และ R2 origin เฉพาะของ deployment หากต้องการจำกัดมากกว่า subdomain wildcards ที่ให้มา ไม่ใส่ inline script/style exception

ตั้ง Cloudflare account identity/auth token ด้วย CLI ตามองค์กร ใช้ service token ที่จำกัด scope; ไม่ใส่ token ใน command arguments หรือ commit

หลัง build ให้ dry run ก่อน:

```powershell
npx cf deploy --prebuilt --mode production --dry-run
# staging ใช้ --mode staging ให้ตรง TRANSFER_MODE ตอน build
```

เมื่อผ่าน staging และได้รับอนุญาต deploy ให้ใช้:

```powershell
npx cf deploy --prebuilt --mode production --secrets-file PATH_TO_PRIVATE_SECRETS_JSON
```

ไฟล์ JSON ที่ไม่อยู่ใน repo มี SUPABASE_SERVICE_ROLE_KEY, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, SHARE_CODE_KEYS เท่านั้น SHARE_CODE_KEYS เป็น string ที่ encode JSON map ของ key version อย่าแนบไฟล์ secrets ใน PR หรือ chat

Domain ใช้ workers.dev หรือกำหนด worker.domains ใน cloudflare.config.ts ตามโดเมนที่มีอยู่ ตั้ง APP_ORIGIN เป็น HTTPS origin เดียวกัน Cron ทุกนาทีอยู่ใน config แล้ว

## Release gate

รัน typecheck, lint, npm test, build, test:runtime, test:e2e และ staging integration จริง ตรวจ bundle ไม่มี service keys, bucket เป็น private, membership deny, download expiry, quota, cron retry และ checksum ไฟล์ 1 GiB ตาม acceptance ก่อนเปิดใช้

`DIRECT_UPLOAD_VERIFIED` ใน config เป็น false โดยตั้งใจ อย่าเปิดจากการผ่าน unit tests ต้องผ่าน browser R2 mismatch-size test และ code review การเปลี่ยนโหมดก่อน

## Rollback

บันทึก Worker version ก่อน release และใช้ Cloudflare Dashboard rollback version เมื่อจำเป็น การ rollback Worker ไม่ rollback PostgreSQL หรือ R2; ห้าม drop schema/revert migration ที่มีไฟล์จริง ใช้ forward migration ที่ตรวจแล้ว เก็บ encryption key versions และ cleanup compatibility ระหว่าง release

Supabase Free อาจพักเมื่อ idle และไม่รับรอง uptime สำหรับงานองค์กรที่ต้องพร้อมตลอดควรใช้แพ็กเกจที่เหมาะสม ไม่ใช้ cron keepalive เพื่อเลี่ยงเงื่อนไขบริการ
