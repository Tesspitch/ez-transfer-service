# Acceptance record

วันที่ดำเนินการ: 2026-11-13

ผลล่าสุด: typecheck/lint ผ่าน, local Vitest 26 tests ผ่าน, Chrome 4 tests ผ่าน, build และ cf prebuilt dry-run ผ่าน; workerd compatibility 2026-11-13 ตรวจ auth/SPA และ streaming exact/oversized/truncated/upstream-error ผ่าน ไม่ได้ deploy

Live integration ยัง BLOCKED เพราะไม่มี R2 และ staging app credentials; ไม่ถือว่า local green แทน staging verification ได้

## Local verification

ตรวจ PostgreSQL ด้วย PGlite (ใช้ migration จริง ไม่จำลอง invariants) และทดสอบ API กับ object adapter สำหรับ test; browser flow ใช้ authenticated API fixtures จึงพิสูจน์ UI ได้แต่ไม่ได้พิสูจน์ provider credentials

ดูผลคำสั่งล่าสุดและ decisions ที่ docs/implementation-progress.md ก่อนอ้างสถานะ release

## Staging gates ที่ยังต้องทำด้วย credentials จริง

- [ ] Supabase migration, asymmetric JWT, member allowlist และ disable public signup ถูกตั้งจริง
- [ ] R2 bucket/private policy/token scope/CORS/lifecycle ตั้งจริง
- [ ] `npm run test:integration` ผ่าน browser upload + mismatch-size enforcement; ห้ามเปิด direct mode ก่อนผ่าน
- [ ] ทดสอบ bounded proxy ใน Worker runtime กับ R2 จริงด้วยไฟล์ 1 GiB สอง browser/สองบัญชี และ hashตรงกัน

มี automated staging test `tests/integration/upload-api.spec.ts` สำหรับสองบัญชีและ checksum 1 GiB; ต้องตั้ง STAGING_APP_URL (hostname มี staging), STAGING_SUPABASE_URL, STAGING_SUPABASE_PUBLISHABLE_KEY, STAGING_OWNER_EMAIL/PASSWORD, STAGING_RECEIVER_EMAIL/PASSWORD และ STAGING_ALLOW_LARGE_TEST=true โดยใช้บัญชีเฉพาะทดสอบ ไม่ใช้บัญชีหรือ password ของผู้ใช้จริงใน CI
- [ ] หมดอายุแล้ว resolve/download ไม่ได้, forever ผ่าน cron และไม่ถูกลบ
- [ ] ปิดบัญชี/ใช้ UUID ไม่มี code ถูกปฏิเสธ; owner แก้ไฟล์คนอื่นไม่ได้
- [ ] ยกเลิก/เครือข่ายหลุด/provider error แล้ว cleanup คืนพื้นที่ครั้งเดียว; ตรวจ no orphans จริง
- [ ] ตรวจ billing alerts, logs redaction, CSP, backup/recovery และ production resource isolation
- [ ] อนุมัติ deploy แล้วค่อยเผยแพร่

ยังไม่มีการ deploy หรือสร้าง provider resources ในการ implement ครั้งนี้
