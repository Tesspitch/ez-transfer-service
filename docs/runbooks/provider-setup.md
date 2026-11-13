# Provider setup — no-login

## Supabase

ใช้เฉพาะPostgreSQL ไม่ต้องตั้งAuth,สร้างบัญชี,allowlist,JWT/JWKS หรือpublishablekeyสำหรับbrowser

รันmigration0001และ0002ตามลำดับผ่านSQL Editor ถ้ารัน0001แล้วรันเฉพาะ `supabase/migrations/202611130002_anonymous_sharing.sql` ใหม่ เป็นadditive transactionไม่เปิดlegacyrowsให้anonymous

Workerใช้SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (รองรับsb_secret_แบบใหม่) เรียกtransfer_rpc_v2ที่grantเฉพาะservice_role; anon/authenticatedไม่มีสิทธิ์เรียก ไม่เปิดschema ttผ่านPostgREST

## R2

ใช้private Standard bucket สร้างstaging/productionแยกกัน ปิดr2.dev/publicdomain สร้างtokenobjectread/writeเฉพาะbucket; ต้องlist/abortmultipartได้ ไม่จำเป็นต้องlistทุกbucket

Lifecycleabortincompletemultipartหลัง1วันเท่านั้น อย่าตั้งdelete ruleครอบtransfers/เพราะมีforever

Default boundedproxyไม่ต้องให้browserPUTตรงR2 หากทดสอบdirectภายหลังตั้งCORSGET/PUTเฉพาะoriginที่ใช้และExposeETag; stagingbrowser testใช้https://transfer-staging.example.test แต่ห้ามใส่productionถ้าไม่ใช่domainจริง

## Environment

`.env` (หรือ.dev.varsสำหรับWorker) ถูกgitignoreและต้องเก็บเฉพาะlocal/privatevalues:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_YOUR_BACKEND_KEY
R2_ACCOUNT_ID=YOUR_ACCOUNT_ID
R2_BUCKET=terminal-transfer-staging
R2_ACCESS_KEY_ID=YOUR_BUCKET_SCOPED_KEY
R2_SECRET_ACCESS_KEY=YOUR_BUCKET_SCOPED_SECRET
SHARE_CODE_KEYS='{"v1":"BASE64_32_RANDOM_BYTES"}'
SHARE_CODE_ACTIVE_KEY=v1
APP_ORIGIN=http://127.0.0.1:5173
DIRECT_UPLOAD_VERIFIED=false
```

Productionใช้APP_ORIGIN=auto; localแยกVite/Workerพอร์ตต้องตรงOriginจริงที่browserเปิด

สร้างSHARE_CODE_KEYSครั้งแรกด้วยcrypto.randomBytes(32).toString('base64') ไม่ใช่ukidที่ได้หลังอัปโหลด อย่าเปลี่ยนทับkeyที่ใช้เข้ารหัสไฟล์เดิม; keyringเก็บรุ่นเก่าเพื่อdecodeได้

RATE_KEY_SECRETเป็นoverrideทางเลือก HMAC-IP rate limitใช้keyแยกdomainที่deriveจากactive share-code keyเมื่อไม่ได้ตั้ง จึงไม่ต้องเพิ่มsecretใหม่เพื่อเริ่มรัน ปิดrawIP/token/URLloggingเสมอ

Frontendไม่อ่าน.envเพื่อเชื่อมSupabaseโดยตรงอีกต่อไป `VITE_SUPABASE_*`เดิมไม่มีconsumerและลบออกได้ ห้ามเอาbackendkeyไปใส่VITE_ไม่ว่ารุ่นใด

R2freeusageไม่ใช่hardcap ตั้งbillingalertsและใช้ข้อมูลที่องค์กรอนุญาตให้ขึ้นcloudได้
