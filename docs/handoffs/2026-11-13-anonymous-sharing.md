# Handoff — No-login + ผู้รับเดียว/หลายผู้รับ

วันที่: 13 พฤศจิกายน 2026
ฐานโค้ด: `a22b40b` บน `feat/terminal-transfer`
สถานะ: ออกแบบเสร็จสำหรับพัฒนาต่อ ยังไม่ได้ implement v2

## อ่านก่อนเริ่ม

1. [Spec v2 — authoritative สำหรับการเปลี่ยนนี้](../superpowers/specs/2026-11-13-anonymous-sharing-design.md)
2. [Spec v1 — retention/storage/cleanup ที่ต้องรักษา](../superpowers/specs/2026-11-13-file-transfer-design.md)
3. [Implementation ledger v1](../implementation-progress.md)

คำสั่งผู้ใช้ล่าสุด: “ระบบ ไม่ต้องมีการ auth และให้มีเมนูเลือกได้ว่า แชร์ให้คนเดียวหรือหลายคน design ตรงนี้เพิ่มให้ผมหน่อย และเขียน handoff ไว้ด้วย” ขอบเขต turn นี้เป็นเอกสาร ไม่ใช่เปลี่ยน product โดยอัตโนมัติ

## Intent ที่ต้องรักษา

เปิดเว็บแล้วใช้ได้ทันที ไม่มี signup/login/allowlist/Supabase Auth แต่ไฟล์ยัง private และเจ้าของเท่านั้นที่ลบ/เปลี่ยนอายุได้ผ่าน management secret ต่อไฟล์ ไม่ใช่เอา Auth middleware ออกเฉย ๆ

single หมายถึงผู้ถือ receiver capability ที่ claim สำเร็จรายแรก retryได้จนไฟล์หมดอายุ ไม่ใช่ one GET/one human; multiple หมายถึงทุกคนที่มี ukid รับได้ ค่าเริ่มต้นเสนอ single, อายุ24h, 1GiB/ไฟล์, global8GiB คงเดิม ไม่เปลี่ยนโหมดหลังcreate

อย่าเพิ่ม expiry30นาทีหลังclaimและอย่าลบไฟล์เมื่อออก URL ผู้ใช้เพิ่งเลือกให้กำหนดอายุไฟล์หรือไม่หมดอายุได้ ไม่มีบัญชีกู้สิทธิ์ที่หายไปไม่ได้ จึงต้องออกแบบ owner link/pending token ก่อน network call

## สถานะจริงของ repo

- v1 มี React terminal dark/light/system, Hono Worker, private R2, Supabase Auth/Postgres, service-only RPC และ migration
- v1 ผ่าน26 local Vitest +4 Chrome tests, typecheck/lint/build, workerd auth/SPA/stream checks และ cf prebuilt dry-run
- ยังไม่มี provider credentials/resources/deployment; real R2 และ1GiB staging testsยัง BLOCKED
- ใช้ `npm run build` สร้าง official `.cloudflare/output/v0/` แล้ว `cf deploy --prebuilt` ไม่ใช้ cf build; installed Vite pluginไม่รับconfig.tsจึงไม่มีpluginในrepo
- มี workerd1.20261113.1 + Miniflare V4 adapter ใน scripts เพื่อให้ local runtime dateตรงproduction
- bounded part proxyเป็นdefault; directuploadปิดจนliveR2size-enforcementผ่าน
- cleanup batch3, reconciliation page3, shared40 network subrequestsเพื่อWorkersFree; ห้ามกลับไป25/100แบบแผนต้นฉบับ

## แผนเปลี่ยนแบบเป็นขั้น

### 1. เขียน tests และ migration ของ capability/claim ก่อน

Create `supabase/migrations/202611130002_anonymous_sharing.sql`, `tests/db/anonymous-sharing.test.ts`, `tests/unit/capabilities.test.ts`

เพิ่ม owner hash/share mode/receiver hash+requestId+claimedAt ให้ transfers; owner_idnullableเฉพาะanonymous rowsที่มีproofครบ; แถวlegacyถูกdenyในv2 ทุกpath สร้าง dispatcher `transfer_rpc_v2` service-only และปรับ rate identityโดยไม่พึ่งauth.users

DB testsต้องพิสูจน์ atomic claim, response-loss replay, wrong proof, immutablemode, legacydeny, expiry/delete race, quota releaseครั้งเดียว; concurrent claimห้ามใช้mockrepositoryเป็นหลักฐานแทนSQL

Interface กลางใน `src/shared/contracts.ts`:

```ts
type ShareMode = 'single' | 'multiple';
type ReceiverStatus = 'unclaimed' | 'mine' | 'not-required';
type OwnerProof = { transferId: string; ownerTokenHash: string };
type ReceiverProof = { transferId: string; receiverTokenHash: string };
// เพิ่ม shareMode ใน create schema/UploadSessionView/ReadyView/TransferView
// public response ไม่ส่ง token hash/object key/raw secrets
```

Implement crypto ใน `src/worker/security/capabilities.ts`: random32bytes/token, base64url representation, validationexactlength, SHA256 hash; owner/receiverเป็นคนละdomain ไม่ยอมรับtokenข้ามบทบาท เก็บhashเท่านั้น ยังคง share-code encryptionสำหรับcopyซ้ำของowner

สร้างpendingowner/clientsecretที่browserก่อนcreate; serverreserve scopeidempotencyกับownerhash ไม่ใช้IDของtransferเป็นหลักฐานสิทธิ์

### 2. เปลี่ยน access checks ของ API ครบทุก endpoint

Modify `src/worker/app.ts`, `src/worker/db.ts`, `src/worker/services/uploads.ts`, `src/worker/services/transfers.ts`, `src/worker/index.ts`, `src/worker/env.ts`; Create `src/worker/security/rate-limit.ts`

- ถอด requireMember/tokenVerifier/JWT dependencyจากrequest path และเปลี่ยนservice methodsจาก Member เป็น OwnerProof/ReceiverProof ตามcontext
- **ทุก upload และ owner endpoint ต้องตรวจ owner capability** ตั้งแต่parts, proxyPUT, complete, code, retention, delete, metadata
- API callerไม่ส่งuserId ใช้headersตามspec ห้ามrouteใหม่เรียกdispatcherv1หรือfallbackเมื่อproofผิด
- `POST resolve` แค่ดูmetadata ไม่claim; `POST :id/claim` atomic; `POST :id/download` แยก single/multiple/ownerตามspec
- ลบ `/api/me` และ global listing อย่าแทนด้วย listallที่ไม่ล็อกอิน
- owner localhistoryfetchต่อid25รายการ concurrency3; hideglobalstorage summaryหากไม่มีownedproof
- HMACIP rate keyใช้trustedCloudflaremetadata+RATE_KEY_SECRET; ratecounterและpendinguploadcountอยู่ในDB คงglobalquotaและnetworkbudget

API testsเพิ่มเติม `tests/unit/anonymous-api.test.ts` ให้ realPGlite+teststorageตามhelperเดิม: publiccreate/resolveได้, wrongroleproofไม่ได้, two receiverssingle/multiple, noAuth503regression

### 3. ปรับ frontend และการเก็บ secrets ใน browser

Modify `src/web/App.tsx`, `src/web/lib/api.ts`, `src/web/features/send/Send.tsx`, `src/web/features/send/multipart-client.ts`, `src/web/features/receive/Receive.tsx`, `src/web/features/files/MyFiles.tsx`, styles; Create `src/web/lib/local-transfers.ts`, `src/web/lib/capabilities.ts`, `src/web/features/manage/Manage.tsx`

- ตัด Session/Login/accountmenu; เปิดSendทันที คงterminal/SystemDarkLight
- Sendเพิ่มradio cards “ผู้รับเดียว/หลายผู้รับ” พร้อมdescriptionตามspec, defaultsingle, disableขณะupload, resultshowmode+separatemanagementlink
- localstorageเก็บownerhistory/pendingcreate; sessionStorageเก็บreceiverpendingclaim/claimedsecret; SSRไม่จำเป็น memoryfallbackเมื่อstorageใช้ไม่ได้
- multipart transport createต้องรับownerToken+idempotencyKeyจากpendingintentและนำproofไปทุกpart/complete/cancel ห้ามgenerateใหม่เมื่อretryคำขอเดิม
- Receiveclaimเฉพาะปุ่มexplicit; persist `{transferId,canonicalCode,receiverToken,claimRequestId,state}` และactivepointerก่อนPOST; หลังreload restorecode/recordแล้วresolveพร้อมreceiverheaderก่อนแสดงสถานะ; claimresponseหลุดretryด้วยproofเดิม; signingfailureไม่clearclaim; ปุ่มdownloadagainใช้tokenเดิม; ไม่เก็บsignedURLและไม่อนุมานmineจากlocalstorageอย่างเดียว
- MyFilesเปลี่ยนเป็น“ไฟล์บนเครื่องนี้” โหลดเฉพาะlocalids ไม่มีserverlist; managefragmentนำownerproofคืนได้โดยไม่account
- sharelinksใช้ukidเท่านั้น; managementlinkแยกownerfragment; อ่านแล้วล้างfragmentก่อนnetwork/analytics; ห้ามpasteownerlinkเป็นreceivelink

Browser testsเปลี่ยน `tests/e2e/transfer.spec.ts`, `tests/e2e/theme.spec.ts` และเพิ่ม `tests/e2e/sharing.spec.ts`: ไม่มีmockloginแล้ว; singleคนแรก/คนที่สอง, multipleสองcontext, reloadclaim, responsefailure, storageunavailable, keyboardradio และmobile375px dark/light

### 4. เอา Auth dependency/config ออกและรักษา regression

ถอด `src/web/features/auth/Login.tsx`, `src/web/lib/auth.ts`, `src/worker/auth.ts` และJWT-onlytestsเมื่อv2testsแทนแล้ว; ถอด jose หากไม่มีconsumer; Supabase JSคงใช้เฉพาะWorkerDBclient

ลบ VITE_SUPABASE_* จาก `.env.example`, README, Playwright webServerenv และ frontendconfig; SupabaseURL/service_roleยังเป็นWorkerenv เพิ่มRATE_KEY_SECRETที่Cloudflaresecretsและlocaldevscript ไม่ส่งbrowser

เปลี่ยน `scripts/verify-runtime.mjs` จากassert401ทุกAPIเป็นverifypublicroutesทำงานตามproofcontract; เช่นknownpublicresolveinvalidcode ->404, ownerendpointไม่มีproof ->404, unknownAPI ->404 JSON ห้ามอ้างruntimeauthcheckเก่าเป็นv2evidence

ปรับ `scripts/dev-worker.mjs`, `cloudflare.config.ts`, `public/_headers`, CI, `tests/integration/upload-api.spec.ts`, README, provider/deploy/operations/acceptancerunbooksให้ตรงno-login สองบัญชีในlivetestเปลี่ยนเป็นสองreceivercontexts/capabilities ไม่ใส่passwordfieldsอีก

เก็บ regressionสำคัญจากv1: AWSemptychecksum signingfix, readycommitresponse-loss recovery, cancellationไม่deleteไฟล์readyผิด, boundedstream upstreamcancel, quota/generationfencing, independentreconciliationcursors และsharednetworkbudget

### 5. Verification และ release gate

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:runtime
npm run test:e2e
npx cf deploy --prebuilt --mode production --dry-run
```

เติมstagingsecretsแล้วค่อย `npm run test:integration`; ที่ยังไม่มีenvต้องรายงานBLOCKEDไม่skipเป็นpass ทดสอบR2จริงและไฟล์1GiBก่อนเปิดใช้ แยกstaging/productionresourcesเหมือนเดิม ยังไม่อนุญาตให้ถือว่ามีdeploymentเพียงเพราะเขียนdesignนี้

ถ้ามีlegacydataจริงทำexpandmigration/restoreproofmigrationด้วยoperator ห้ามdropv1tablesหรือเผยแพร่codeเดิมโดยอัตโนมัติ อย่าแก้migration0001ย้อนหลัง

## Pitfalls ที่ห้ามทำ

1. เอาJWTmiddlewareออกแล้วคงAPIowneridเดิมไว้ จะเปิดทางแก้ไฟล์คนอื่น
2. consume singleจากresolve/GET/linkpreview จะทำให้botแย่งสิทธิ์
3. single=ดาวน์โหลดหนึ่งครั้ง จะพังเมื่อbrowserretryหรือsignedURLหมดอายุ
4. claimแล้วลบไฟล์/เปลี่ยนอายุ จะขัดretentionที่ผู้ใช้เลือก
5. generate receiversecretหลังserverclaimresponse จะกู้ไม่ได้เมื่อresponseหลุด
6. ฝังownersecretในukid/receivelink จะให้ผู้รับลบไฟล์ได้
7. อ้าง“หนึ่งคนจริง”หรือ“ดาวน์โหลดเสร็จแล้ว”โดยไม่มีหลักฐาน
8. ทำMyFilesเป็นpublicserverlistingหรือเก็บrawIP/tokenในlogs

## Definition of done

v2specacceptanceผ่าน, no-loginจริงทุกbrowserflow, owner/receiverproofแยกชัด, singleclaimatomicและretryได้, multipleไม่consume, Dark/Light/mobileไม่มีregression, DB/cleanup/accountingไม่เสีย และdeploymentstatusตรงหลักฐาน ไม่มีคำขอเพิ่มเติมจากผู้ใช้ที่จำเป็นต่อการเขียนโค้ดตามdefaultในspec; ผู้รับhandoffต้องแจ้งการเลือกdefaultเหล่านี้เมื่อเริ่มimplementation
