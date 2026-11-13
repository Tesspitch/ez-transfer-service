# Acceptance record

วันที่ดำเนินการ: 2026-11-13

ผลล่าสุดv2: typecheck/lint ผ่าน, local Vitest31 tests ผ่าน, Chrome5 tests ผ่าน, build และcf prebuilt dry-runผ่าน; workerd compatibility2026-11-13ตรวจpublicroutes/ownerproof/SPAและstreaming exact/oversized/truncated/upstream-errorผ่าน ไม่ได้deploy

ตรวจproviderด้วย.envจริงก่อนหน้านี้: Supabasev1RPCและR2multipart/signeddownload/cleanup34bytesผ่าน ล่าสุดv2RPCยังPGRST202จึงต้องรันmigration0002เพิ่มเติม Browser1GiBstagingtestยังไม่รัน ไม่ถือว่าlocalgreenแทนผลจริงได้

## Local verification

ตรวจPostgreSQLด้วยPGliteและmigrationจริง: singleclaimพร้อมกันได้หนึ่งราย, retryclaim/completeปลอดภัย, legacyrowsไม่เปิดเผย, quota/expiryรักษาเดิม Browserflowใช้anonymous APIfixtures ไม่พึ่งloginหรือSupabaseAuth

ดูผลคำสั่งล่าสุดและ decisions ที่ docs/implementation-progress.md ก่อนอ้างสถานะ release

## Staging gates ที่ยังต้องทำด้วย credentials จริง

- [ ] Supabase migration0002ถูกนำไปใช้จริง ไม่มีขั้นตั้งAuth/JWT/allowlistในรุ่นv2
- [ ] R2 bucket/private policy/token scope/CORS/lifecycle ตั้งจริง
- [ ] `npm run test:integration` ผ่าน browser upload + mismatch-size enforcement; ห้ามเปิด direct mode ก่อนผ่าน
- [ ] ทดสอบboundedproxyในWorkerกับR2จริงด้วยไฟล์1GiBสองbrowserโดยไม่ล็อกอินและhashตรงกัน

Automatedstagingtest `tests/integration/upload-api.spec.ts` ต้องตั้งเพียงSTAGING_APP_URL(hostnameมีstaging)และSTAGING_ALLOW_LARGE_TEST=true ไม่ต้องมีemail/password สำหรับrawR2browsertestยังต้องใช้stagingbucket+token
- [ ] หมดอายุแล้ว resolve/download ไม่ได้, forever ผ่าน cron และไม่ถูกลบ
- [ ] UUIDหรือukidอย่างเดียวแก้ไฟล์ไม่ได้, wrongowner/receiverproofถูกปฏิเสธ, singleclaimคนที่สองไม่ได้, multipleรับได้หลายbrowser
- [ ] ยกเลิก/เครือข่ายหลุด/provider error แล้ว cleanup คืนพื้นที่ครั้งเดียว; ตรวจ no orphans จริง
- [ ] ตรวจ billing alerts, logs redaction, CSP, backup/recovery และ production resource isolation
- [ ] อนุมัติ deploy แล้วค่อยเผยแพร่

ยังไม่มีการ deploy หรือสร้าง provider resources ในการ implement ครั้งนี้
