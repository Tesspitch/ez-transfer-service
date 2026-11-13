# Terminal Transfer Implementation Plan

สถานะ 2026-11-13: implementation และ local verification อยู่ใน [progress ledger](../../implementation-progress.md); provider provisioning, live staging และ production release ยังรอ credentials/การตั้งค่าบริการจริง รายการด้านล่างเป็นแผนต้นฉบับก่อน rulings อย่าใช้ checkbox ว่างแทนหลักฐานสถานะล่าสุด

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างเว็บส่งไฟล์ภายในองค์กรผ่าน ukid รองรับ R2 ไฟล์ใหญ่ และ terminal UI ที่สลับ dark/light ได้

**Architecture:** Cloudflare Worker ให้บริการ React SPA และ authenticated API; เบราว์เซอร์ส่งไฟล์ตรง private R2 ด้วย multipart ส่วน Supabase ให้ Auth และ Postgres สำหรับ metadata, quota และ durable cleanup intents ไม่มี file bytes ผ่าน API ยกเว้น fallback bounded part proxy ที่ต้องพิสูจน์ความจำเป็นก่อน

**Tech Stack:** React, Vite, TypeScript, Hono, Zod, Supabase JS, jose, AWS S3 SDK/presigner, Vitest, Playwright, SQL migrations; npm package lock และ Cloudflare cf CLI

**Spec:** [System Design](../specs/2026-11-13-file-transfer-design.md) — อ่านทั้งสองเอกสารก่อนเริ่ม

## Global Constraints

- หนึ่งองค์กรต่อ deployment, หนึ่งไฟล์ต่อรายการ, สูงสุด 1 GiB (1,073,741,824 bytes) ต่อไฟล์, พื้นที่รวมแบบนับไฟล์และรายการจองไม่เกิน 8 GiB (8,589,934,592 bytes)
- retention = 1h | 24h | 7d | forever และ expires_at = null สำหรับ forever
- เริ่มอายุหลัง ready; รับ code ไม่ต่ออายุและไม่ consume code; owner เปลี่ยนอายุได้เฉพาะไฟล์ ready ที่ยังไม่หมดอายุ
- Multipart part size 16 MiB, concurrency 3, retries 3 ครั้งต่อ part; session deadline 2 ชั่วโมง; signed part URL ไม่เกิน 10 นาทีและไม่เกิน deadline
- signed download URL มีอายุไม่เกิน min(5 นาที, เวลาที่เหลือของไฟล์)
- Rate policy: create 10/min/user, resolve+receiver download รวม 30/min/user, API อื่นรวม 120/min/user
- Theme selector System / Dark / Light; ค่าเริ่มต้น System; persist ใน localStorage
- UI ภาษาไทย; timestamps DB UTC, UI Asia/Bangkok; อย่าใส่ raw share codes, signed URLs, JWT หรือ credentials ใน logs
- ขั้นนี้เป็นเอกสารเท่านั้น; ยังไม่ scaffold, install, สร้าง cloud resource หรือ deploy

## Review Focus

1. Delete/expiry กับ complete พร้อมกัน: ห้ามกลับจาก deleting เป็น ready และต้องลบ late object (Task 3, 5)
2. จองพื้นที่พร้อมกันและ retry: ห้ามเกิน 8 GiB หรือ release ซ้ำ (Task 2, 5)
3. Account ถูกปิดขณะที่ JWT ยังไม่หมดอายุ: API ต้องปฏิเสธและไม่แสดงชื่อไฟล์ (Task 2, 4)
4. ขนาดจริง/ชื่อไฟล์ไม่ตรงข้อมูล client: ปิดช่องอัปโหลดเกิน quota และ header injection (Task 3, 4)
5. Network/reload/theme storage ไม่พร้อม: ไม่แสดง ready ปลอม, ไม่ flash ธีม, retry ได้อย่างชัดเจน (Task 6, 7)

## Repository map

ใช้ repo เดียว ไม่มี monorepo tooling เพิ่ม: `src/web/` React, `src/worker/` API + scheduled handler, `src/shared/` schemas/types, `supabase/migrations/` SQL, `tests/unit/`, `tests/integration/`, `tests/e2e/`, `docs/runbooks/`

Root: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `cloudflare.config.ts`, `.env.example`, `.gitignore`, `index.html`

เลือก versions stable ที่เข้ากันได้และ pin ใน lock ตอนเริ่ม ไม่เดาเวอร์ชันล่วงหน้า ตรวจ Cloudflare cf CLI schema ก่อนกำหนด config ให้ตรง CLI จริง ถ้ายังไม่เป็น git repo ให้ init ที่ execution time หลังตรวจ local instructions แล้ว; commit ขั้นงานเมื่ออยู่ใน repo และไม่มีการ stage ไฟล์อื่นของผู้ใช้

## Task 1: พิสูจน์เส้นทางอัปโหลดและ runtime บน staging

**Files:** Create `tests/integration/r2-multipart.spec.ts`, `src/worker/storage/r2.ts`, `src/shared/contracts.ts`, `docs/runbooks/provider-setup.md` และ root configuration ตาม repository map

**Interfaces:**
- `Retention = '1h' | '24h' | '7d' | 'forever'`; `TransferState = 'allocating' | 'uploading' | 'finalizing' | 'ready' | 'deleting' | 'deleted'` ใน contracts.ts
- `R2Store.create(key: string): Promise<{uploadId: string}>`
- `R2Store.signPart(input: {key:string; uploadId:string; partNumber:number; sizeBytes:number; ttlSeconds:number}): Promise<string>`
- `R2Store.inspectParts(key:string, uploadId:string): Promise<{partNumber:number;sizeBytes:number;etag:string}[]>`
- `R2Store.complete(key:string, uploadId:string, parts:{partNumber:number;etag:string}[]): Promise<void>`
- `R2Store.head(key:string): Promise<{sizeBytes:number}|null>`; `abort(key:string,uploadId:string): Promise<void>`; `delete(key:string): Promise<void>`
- `R2Store.listUploads(prefix:string,cursor?:string): Promise<{items:{key:string;uploadId:string;initiatedAt:string}[];nextCursor?:string}>` สำหรับ recover create ที่สูญเสีย response
- `R2Store.signDownload(key:string, name:string, ttlSeconds:number): Promise<string>`

- [ ] Provision staging เท่านั้นตาม permission ตอน execution: private Standard bucket, CORS GET/PUT + ETag, separate Supabase project, asymmetric JWT key; บันทึกขั้นตอนที่ผู้ดูแลต้องทำและ provider billing activation ตาม dashboard จริง
- [ ] Scaffold minimal typed Worker/static assets และ npm scripts: `dev`, `build`, `typecheck`, `lint`, `test:unit`, `test:db`, `test:integration`, `test:e2e`; รวม package engine requirement ที่ตรง runtime
- [ ] เขียน integration test ใช้ Playwright browser ส่ง multipart 16 MiB + 1 byte; assert HEAD size = 16777217, signed size mismatch ถูกปฏิเสธ, abort/delete ซ้ำไม่ล้ม และไม่มี public GET
- [ ] Run `npm run test:integration -- r2-multipart` ให้เห็น red ก่อน adapter implementation (ต้องมี staging env; missing env = blocked ไม่รายงาน pass)
- [ ] Implement adapter และยืนยัน browser PUT ที่เซ็น Content-Length ใช้งานและ enforce จริง หากไม่ enforce ใช้ bounded 16 MiB part proxy พร้อม test oversized stream terminates; บันทึกทางเลือกที่พิสูจน์ได้ลง spec ก่อนต่อ Task 3
- [ ] Run `npm run typecheck` และ `npm run test:integration -- r2-multipart`; expected pass รวม wrong-size test; cleanup test objects ใน finally
- [ ] Commit `chore: establish worker runtime and verify bounded R2 uploads`

## Task 2: Auth, database invariants และ quota

**Files:** Create `supabase/migrations/202611130001_transfer_core.sql`, `supabase/tests/transfer_core.sql`, `src/worker/auth.ts`, `src/worker/db.ts`, `src/worker/security/rate-limit.ts`, `tests/unit/auth.test.ts`

**Interfaces:**
- `requireMember(request:Request, env:Env): Promise<{userId:string;role:'admin'|'member'}>` validates JWT then checks active membership
- `TransferRepository.reserve(input:{ownerId:string;idempotencyKey:string;name:string;sizeBytes:number;retention:Retention}): Promise<UploadRecord>`; repeated same key/body returns same id, same key/different body = 409
- Repository methods `getOwned(id,userId)`, `getActiveMember(userId)`, `consumeRate(userId, action, now)`, `activateUpload(id,uploadId)`, `beginFinalize(id,userId)`, `markReady(id,codeData,now)`, `requestDelete(id,userId,now)`; transactional contracts from design, no generic client SQL
- SQL `reserve_transfer`, `activate_upload`, `begin_finalize`, `mark_transfer_ready`, `request_transfer_delete`, `consume_rate`, `claim_cleanup_batch`, `finish_cleanup`, `retry_cleanup` service-only RPC; repository translates domain errors to typed errors

- [ ] เพิ่ม schema, indexes expiry/owner/job due, idempotency_requests owner+key unique + payload fingerprint + replay410เมื่อdeleted + retention7วันตามspec, accounting checks nonnegative และ row locking; rollback-safe migrations on empty staging
- [ ] เขียน SQL transaction tests: 8 simultaneous 1 GiB reserves succeed, ninth rejected, same request retriedไม่เพิ่ม reserved, markReady twiceไม่ย้ายยอดซ้ำ, release ต้องเกิดหลัง cleanup confirmation, anon/authenticated เรียก privileged RPC ไม่ได้
- [ ] Run `npm run test:db`; expected failing invariants จน implementar RPC ครบ
- [ ] Implement RPC transactions และ repository using service key; update operation ต้อง check state + lease_generation ก่อน/หลังR2 ไม่เขียน state โดย client; lock order budget then transfer สม่ำเสมอ
- [ ] เขียน auth tests: invalid signature/issuer/audience/expired ->401, valid JWT inactive ->403, membership unavailable ->503; rate 31st receiver request in minute ->429 across two worker instances
- [ ] Implement auth/JWKS และ durable rate counter; Run `npm run test:db` และ `npm run test:unit -- auth`; expected PASS
- [ ] Commit `feat: enforce member access and transactional storage reservations`

## Task 3: Upload API และ finalization recovery

**Files:** Create `src/worker/index.ts`, `src/worker/routes/uploads.ts`, `src/worker/services/uploads.ts`, `src/shared/upload-schema.ts`, `tests/unit/uploads.test.ts`, `tests/integration/upload-api.spec.ts`

**Interfaces:**
- `UploadService.create(member,input,idempotencyKey): Promise<UploadSessionView>`
- `UploadService.signParts(member,id,partNumbers:number[]): Promise<SignedPart[]>`
- `UploadService.complete(member,id): Promise<{id:string;code:string;readyAt:string;expiresAt:string|null}>`
- Types `UploadSessionView`, `SignedPart`, `UploadRecord`, `ApiError` live in shared contracts and match API table in spec

- [ ] เขียน tests: 0/1073741825 bytes rejected, 1073741824 accepted if quota; path injection filenameไม่ใช้เป็นkey; part indexเกิน/ซ้ำ/>3 rejects; URLไม่ข้าม deadline; completed parts sizeผิดไม่ ready
- [ ] Run `npm run test:unit -- uploads`; expected FAIL before service
- [ ] Implement reserve -> R2 create -> activate with compensation; UUID key, 2h hard deadline, sign bounded parts และ complete ผ่าน listParts; never return code before checked HEAD + ready transaction
- [ ] เพิ่ม tests duplicate complete returns same code, lease contention safe, stale create/complete generationห้ามactivate/readyและenqueuecompensation, delete wins over finalizing, DB failure after R2 complete recoverable, expired/inactive owner cannot finalize
- [ ] Run `npm run test:unit -- uploads` และ `npm run test:integration -- upload-api`; expected PASS รวม failure injection โดยไม่มี untracked completed objects
- [ ] Commit `feat: add bounded multipart upload and recoverable finalization`

## Task 4: Code, receive, download และ My Files API

**Files:** Create `src/worker/security/share-code.ts`, `src/worker/routes/transfers.ts`, `src/worker/services/transfers.ts`, `tests/unit/transfers.test.ts`, `tests/unit/share-code.test.ts`

**Interfaces:**
- `generateCode(): string`; `normalizeCode(value:string): string`; `hashCode(code:string): Promise<string>`; `encryptCode(code:string,keyVersion:string): Promise<string>`; `decryptCode(ciphertext:string): Promise<string>`
- `TransferService.resolve(member,code): Promise<ReceiveView>`; `download(member,id,code?): Promise<{url:string;expiresAt:string}>`
- `TransferService.listOwned(member,cursor?): Promise<{items:OwnedTransferView[];nextCursor:string|null}>`; `changeRetention(member,id,retention): Promise<OwnedTransferView>`; `delete(member,id): Promise<{state:'deleting'}>`
- Repository extensions: `findReadyByCodeHash`, `listOwned`, `updateRetention`, `appendEvent`, guarded code retrieval; forbid restoring expired state

- [ ] เขียน tests code entropy length26, case/hyphen normalization, encryption roundtrip/tampering fails, ciphertext/hash only in database/logs; two different active members can resolve same code without consuming
- [ ] Run `npm run test:unit -- share-code`; expected FAIL แล้ว implement random128/SHA256/AES-GCM with key version
- [ ] เขียน tests: guessed id no code ->404; owner B cannot list/update/delete A; resolve wrong/expired/inactiveไม่มี metadata; TTL at expiry-60sec <=60; now=expires_atไม่มี URL; forever URL <=300sec
- [ ] Implement API in spec, safe UTF-8 attachment filename, cursor limit25, no-store, requestId and sanitized error mapping; download audit ใช้ชื่อ event download_url_issued ไม่เรียก downloaded
- [ ] เพิ่ม retention tests default24h, 1h/7d from ready, forever null, change uses now, expired cannot revive, filename containing CRLF/HTMLไม่เข้าหัวresponseหรือ markup
- [ ] Run `npm run test:unit -- transfers` และ `npm run test:unit -- share-code`; expected PASS
- [ ] Commit `feat: add private code-based receiving and file management`

## Task 5: Durable cleanup และ reconciliation

**Files:** Create `src/worker/jobs/cleanup.ts`, `src/worker/jobs/reconcile.ts`, `tests/unit/cleanup.test.ts`, `tests/integration/cleanup.spec.ts`, `docs/runbooks/operations.md`

**Interfaces:** `runCleanup(env:Env,now:Date): Promise<{claimed:number;deleted:number;retried:number}>`; `reconcileOrphans(env:Env,now:Date,cursor?:string): Promise<{nextCursor?:string}>`; repository job leases and retry RPC from Task 2

- [ ] เขียน fake-clock tests: expiry exactly closes API; forever ignored; crashหลังdeleteก่อนDB retryปลอดภัย; R2 failureไม่คืนquota; two cron instancesไม่releaseซ้ำ; cancel during completeไม่มีready resurrection
- [ ] Run `npm run test:unit -- cleanup`; expected FAIL
- [ ] Implement cronทุกนาที batch25, generation-fenced lease/retries capped1h; active/deadline uploads abort+delete; completion lease recovery; finalize tombstone onlyหลังlatest URL expiry+2mและconfirm object absence; ambiguous external operationคงreservation24hแล้วตรวจทั้งobjectและincomplete uploadsก่อนrelease เก็บtombstone7วัน
- [ ] Implement paginated daily reconciliation ทั้งobjectsและListMultipartUploads with24h orphan grace; allocating/deletingที่uploadIdหายให้scan prefixรายkeyแล้วabort; lifecycleabortincomplete1วันเป็นsafety net; persist scan cursor/reconciliation heartbeat ใน service-only maintenance row (เพิ่ม migration `202611130002_maintenance.sql`), ไม่ full-scan ทุกนาที
- [ ] เพิ่ม integration failure injection for lost create response, R2 complete/DB ready gap, DB unavailable cron, late part URLs and lingering object; verify eventual absence and accounting conservation
- [ ] Run `npm run test:unit -- cleanup` และ `npm run test:integration -- cleanup`; expected PASS; runbookมี stuck job >10m alert, retry, pause/resume Supabase, budget/accounting repair แบบตรวจ object ก่อน
- [ ] Commit `feat: reclaim expired storage with durable cleanup and reconciliation`

## Task 6: Terminal UI และ user flows

**Files:** Create `src/web/main.tsx`, `src/web/App.tsx`, `src/web/styles/tokens.css`, `src/web/styles/app.css`, `src/web/theme.ts`, `src/web/lib/api.ts`, `src/web/lib/auth.ts`, `src/web/features/auth/Login.tsx`, `src/web/features/send/Send.tsx`, `src/web/features/send/multipart-client.ts`, `src/web/features/receive/Receive.tsx`, `src/web/features/files/MyFiles.tsx`, `tests/unit/multipart-client.test.ts`, `tests/e2e/transfer.spec.ts`, `tests/e2e/theme.spec.ts`

**Interfaces:** `uploadFile(file:File,retention:Retention,options:{signal:AbortSignal;onProgress:(bytes:number)=>void}): Promise<{id:string;code:string;expiresAt:string|null}>`; typed `api` client covers spec routes with refreshed Supabase bearer session; `Theme = 'system'|'dark'|'light'`

- [ ] สร้าง UI จาก design tokens และ terminal panels; มี Send/Receive/My Files, login, logout, account status, System/Dark/Light; ใช้ text จริง ไม่ใส่ provider names/implementation logs ใน flow
- [ ] เขียน multipart-client tests concurrency<=3, attempt<=4รวมครั้งแรก, expired URL refresh after auth, abort stops queueและเรียกDELETE, failed partsไม่ทำcomplete; Run `npm run test:unit -- multipart-client` เพื่อ red แล้ว implement
- [ ] เชื่อม drop/picker/clipboard file, retention select, progress, cancel/retry, result copy code/link; code URL ใช้ fragmentและล้างก่อนrequest; unexpected clipboard unavailableแสดงmanual copy
- [ ] เชื่อม ReceiveและMy Files: unknown/expired safe error, deletion pendingไม่แสดงพื้นที่คืนปลอม, retention edit, confirmation delete, pagination และ auth expiry ที่ไม่ทำให้ไฟล์พร้อมปลอม
- [ ] เพิ่ม Playwright mocked API flows: Thai/long filename safe, paste code, copy permission denied, network loss retry, stale auth, file too large, quota full, empty list และ receivingในบัญชีที่สอง
- [ ] เพิ่ม theme tests initial OS dark/light, override persists, OS change only system, storage exception fallback, mobile375pxไม่มีhorizontal body scroll, keyboard focusทุกactionและstatus announcements
- [ ] Run `npm run test:unit -- multipart-client`, `npm run test:e2e`, `npm run build`; expected PASS; visual inspect desktop1440px/mobile375pxทั้งdark/lightรวมerror/progress states ปรับcontrast AAและfocusก่อนผ่าน
- [ ] Commit `feat: build terminal file transfer interface with persistent themes`

## Task 7: Deployment hardening และ acceptance

**Files:** Create `tests/e2e/staging.spec.ts`, `docs/runbooks/deploy.md`, `docs/runbooks/acceptance.md`, `.github/workflows/ci.yml`; modify Worker config, headers, environment docs

**Interfaces:** release artifact ผ่าน CI; `/api/*` always Worker, other app paths SPA; staging/production secrets and resources isolated

- [ ] เพิ่ม CSP/no-referrer/nosniff, request logging redaction, CORS exact origins, staging-only origin tests; deny public R2/r2.dev; verify error/requestIdไม่มี internal details
- [ ] CI gates `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:db`, `npm run build`, `npm run test:e2e`; live R2 integrationแยก manual/environment job ใช้staging secretsเท่านั้น
- [ ] Run gates และ `npm run test:integration` ใน staging; expected PASS ทุกrequired check; missing live credentialsรายงานblockedไม่ใช้skipเป็นหลักฐานpass
- [ ] Staging acceptanceสองbrowser/สองaccount: upload1GiB deterministic fixture, ดาวน์โหลด hashตรง, เจ้าของปิดtabยังรับได้, anonymous/inactive/guessIDถูกปฏิเสธ, short-test retentionหมดอายุ, foreverผ่านcron, cleanup failure retryไม่เสียquota
- [ ] ตรวจ dist และ build logs ไม่มี server keys; inspect production routes/secretsและ billing alerts; runbookอธิบายURL revoke caveat, ไม่มีantivirus, no E2EE, free-tier pauseและquota limitations
- [ ] เตรียมreleaseพร้อมreviewผลทดสอบและresource diff; ใช้Cloudflare cf CLI ตาม schemaที่ตรวจแล้ว; deploy productionเมื่อได้รับอนุญาตในขั้นนั้น เก็บmigration forward-fix/Worker rollback steps; rollback Workerไม่rollbackข้อมูลอัตโนมัติ
- [ ] Commit `chore: document and verify production release readiness`

## Dependency order และ execution handoff

Task1 -> Task2 -> Task3 -> Task4 -> Task5 -> Task6 -> Task7; อ่านและแก้builder reviewก่อนTask1 โดยเฉพาะsigned upload size enforcementซึ่งเป็นgo/no-goทางเทคนิค

แนะนำ implement ในแชตนี้แบบลำดับงานโดยผู้พัฒนาคนเดียว เพราะ state machine และ quota contract เชื่อมกันมาก จากนั้นใช้ reviewerอิสระก่อนrelease ผู้ใช้ยังไม่ได้สั่งเริ่มimplementation; แผนนี้เตรียมไว้ให้ตรวจแบบและสมมติฐานก่อน

Self-review checklist: specทุกส่วนมีtask, ขนาด/TTL/rateตรงกัน, ไม่มีprodsecretในpreview, code/URLไม่เข้าlogs, cleanupทนretry, bounded uploadผ่านlive test, dark/light/mobileมีvisual QA; ถือว่าcompleteเฉพาะเมื่อมีหลักฐานผลตรวจจริง ไม่ใช่เพียงเขียนtestไว้
