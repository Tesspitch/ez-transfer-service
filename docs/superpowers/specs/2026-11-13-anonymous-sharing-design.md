# TRANSFER v2 — ไม่ต้องล็อกอินและเลือกจำนวนผู้รับ

วันที่: 13 พฤศจิกายน 2026
สถานะ: ผู้ใช้ยืนยันให้เอาการล็อกอินออกจากตัวแอปแล้ว; implementation v2อยู่ในworking tree ดูหลักฐานล่าสุดที่docs/implementation-progress.md
Baseline implementation: commit `a22b40b`

## 1. ขอบเขตและลำดับเอกสาร

ผู้ใช้ขอให้ไม่มีการ auth และให้เลือกแชร์ให้คนเดียวหรือหลายคน ใน UX หมายถึงเปิดเว็บแล้วส่ง/รับไฟล์ได้ทันที ไม่สมัครสมาชิก ไม่ล็อกอิน ไม่มี account menu, allowlist หรือ Supabase Auth

เอกสารนี้เป็น spec ล่าสุดสำหรับ identity, ownership, sharing และ UI ที่เกี่ยวข้อง แทนส่วน Auth/members/owner_id/การแชร์ของ [spec v1](2026-11-13-file-transfer-design.md) ส่วนไฟล์ใหญ่, retention, multipart, accounting, cleanup และ terminal dark/light ยังคงใช้ v1 พร้อม implementation rulings ใน [ledger](../../implementation-progress.md)

การไม่มีบัญชีไม่ได้ทำให้ไฟล์เป็น public bucket: ukid ใช้รับไฟล์ และรหัสจัดการเฉพาะรายการใช้ลบ/เปลี่ยนอายุ/ดูรหัสซ้ำ ผู้รับไม่มีสิทธิ์จัดการไฟล์

ข้อเสนอของผู้ออกแบบที่กำหนดให้ implementation ชัดเจน:

- ค่าเริ่มต้นของเมนูแชร์คือ **ผู้รับเดียว**
- หนึ่งรายการยังมีหนึ่งไฟล์ สูงสุด 1 GiB; พื้นที่ stored+reserved รวม 8 GiB
- อายุเริ่มต้น 24 ชั่วโมง เลือก 1 ชั่วโมง / 24 ชั่วโมง / 7 วัน / จนกว่าจะลบเองได้เหมือนเดิม
- เลือกโหมดก่อนเริ่มอัปโหลด และเปลี่ยนโหมดของรายการที่สร้างแล้วไม่ได้
- โหมดผู้รับเดียว = หนึ่งสิทธิ์รับไฟล์ที่ถูกจองสำเร็จครั้งแรก ไม่ใช่ดาวน์โหลดครั้งเดียว และไม่ใช่การพิสูจน์ว่ามนุษย์คนใดเป็นผู้รับ
- ไม่เริ่มนับเวลา 30 นาทีใหม่หลัง claim: สิทธิ์ผู้รับคงอยู่จนไฟล์หมดอายุหรือเจ้าของลบ สามารถ retry/resume ดาวน์โหลดได้ตามความสามารถเบราว์เซอร์และ Storage
- การออก signed GET ยังคงอายุสั้นสูงสุด 5 นาทีหรือเวลาที่เหลือของไฟล์ ไม่เปลี่ยนอายุไฟล์

## 2. ทางเลือกที่พิจารณา

| วิธี | ผลที่ผู้ใช้ได้ | ข้อสรุป |
| --- | --- | --- |
| ใช้ code แล้วลบทันทีเมื่อเริ่ม GET | ลิงก์ preview หรือ network retry อาจใช้สิทธิ์หมดก่อนผู้รับได้ไฟล์ | ไม่เลือก |
| ปุ่มรับสิทธิ์แบบ atomic แล้วผูกกับรหัสลับในเบราว์เซอร์ผู้รับ | คนแรกได้สิทธิ์ แต่ยัง retry ดาวน์โหลดได้ และเปิดลิงก์ดูเฉย ๆ ไม่ consume | เลือกสำหรับผู้รับเดียว |
| ทุกคนที่มี ukid ขอลิงก์ได้จนหมดอายุ | แชร์ให้หลายเครื่องได้ ไม่จำกัดเป็นรายบุคคล | เลือกสำหรับหลายผู้รับ |

ไม่มีบัญชีจึงไม่สามารถรับรองจำนวนมนุษย์จริงหรือห้ามผู้รับส่งต่อไฟล์/รหัสลับได้ ชื่อใน UI ต้องอธิบายพฤติกรรมนี้ตรง ๆ ไม่ใช้ข้อความว่า “ยืนยันตัวตนผู้รับแล้ว”

## 3. Stack หลังเปลี่ยน

| ส่วน | Stack |
| --- | --- |
| Frontend/Theme | React + Vite + TypeScript, CSS tokens, System/Dark/Light |
| Hosting/API | Cloudflare Workers Static Assets + Hono |
| File storage | Private Cloudflare R2 Standard |
| Metadata/transaction | Supabase PostgreSQL ผ่าน service-only RPC |
| Account authentication | ไม่มี; ถอด Supabase Auth/JWT/JWKS ออกจาก app |
| Cleanup | Cron, durable jobs, generation fencing, shared subrequest budget ตาม implementation ปัจจุบัน |

browser ไม่ต้องมี Supabase URL/key อีกแล้ว มีเพียง same-origin API; เก็บ SUPABASE_URL และ service_role key เฉพาะ Worker ไม่เพิ่ม D1/Redis/Realtime

## 4. Frontend และเมนูการแชร์

### หน้า Send

เปิด `/` เห็นหน้า Send ทันที คงแท็บ ส่งไฟล์ / รับไฟล์ / ไฟล์บนเครื่องนี้; ตัด login, logout, email, account loading และข้อความเฉพาะสมาชิกออก เปลี่ยน badge PRIVATE WORKSPACE เป็น FILE TRANSFER ไม่อ้างว่าเป็น private organization access

หลังช่องเลือกไฟล์และก่อนอายุไฟล์ แสดง radio cards สองตัวใน fieldset ที่มี legend “แชร์ไฟล์ให้”:

```text
$ transfer send

[ วางไฟล์หรือคลิกเลือกไฟล์                         ]

แชร์ไฟล์ให้
[● ผู้รับเดียว                  ] [○ หลายผู้รับ                 ]
 คนแรกที่กดรับสิทธิ์จะรับไฟล์ได้    ทุกคนที่มีรหัสรับได้จนหมดอายุ

เก็บไฟล์ไว้                [24 ชั่วโมง                    ▾]
[ อัปโหลดไฟล์ ↗ ]
```

radio cards ใช้สี accent เฉพาะตัวเลือกปัจจุบัน มีข้อความ/สถานะ checked และ keyboard arrows/Tab มาตรฐาน; mobile เรียงแนวตั้ง, target >=44px, dark/light ใช้ tokens เดิม ไม่ต้องพิมพ์คำสั่งจริง

ขณะส่งไฟล์ disable radio และ retention เพื่อให้ค่าที่เห็นตรง session; หลังสำเร็จแสดง ukid, copy code, copy receive link, badge โหมด และ expiry พร้อมข้อความเฉพาะโหมด:

- ผู้รับเดียว: “คนแรกที่กดรับสิทธิ์จะใช้รหัสนี้รับไฟล์ได้”
- หลายผู้รับ: “ทุกคนที่มีรหัสนี้รับไฟล์ได้จนหมดอายุ”

แสดงส่วน “จัดการไฟล์นี้” แยกจากปุ่มแชร์ มีปุ่มคัดลอกลิงก์จัดการ และข้อความ “เก็บลิงก์นี้ไว้สำหรับลบหรือเปลี่ยนอายุไฟล์ อย่าส่งให้ผู้รับ” ไม่ใส่ management secret ใน receive link หรือ QR ที่ใช้รับไฟล์

### หน้า Receive

กรอก ukid/เปิด `/receive#code=...` แล้วกด “ค้นหาไฟล์” เพื่อดู metadata การค้นหาไม่ claim ไม่ออก download URL และไม่ลบไฟล์ ลิงก์ preview/GET/HEAD ไม่มี side effect

```text
$ transfer receive
[ ukid                                      ] [ ค้นหาไฟล์ → ]

report.zip                           128 MiB
แชร์ให้: ผู้รับเดียว                 หมดอายุ: ...
[ รับสิทธิ์และดาวน์โหลด ↓ ]
คนแรกที่กดปุ่มนี้จะได้สิทธิ์รับไฟล์
```

- single + unclaimed: แสดง “รับสิทธิ์และดาวน์โหลด” กดแล้ว persist pending token/requestId/code/id -> claim -> mark confirmed -> POST download -> เริ่ม GET
- single + claimed โดยเบราว์เซอร์นี้: แสดง “คุณได้รับสิทธิ์แล้ว” และ “ดาวน์โหลดอีกครั้ง” ไม่มี timeout ใหม่
- single + claimed โดยเบราว์เซอร์อื่น: “ไฟล์นี้มีผู้รับแล้ว” ไม่คืนชื่อ/ขนาดไฟล์ใน response ใหม่
- multiple: แสดง “ดาวน์โหลดไฟล์” โดยไม่ต้อง claim
- download/signing ล้มเหลวหลัง claim: คง receiver secret และสิทธิ์เดิม แสดง “ได้รับสิทธิ์แล้ว แต่เริ่มดาวน์โหลดไม่สำเร็จ ลองอีกครั้งได้” ห้าม rollback claim หรืออนุญาตคนใหม่โดยอัตโนมัติ
- รับรหัสที่ expiry แล้ว/ไม่ถูกต้อง: ข้อความรวม “ไม่พบไฟล์หรือรหัสหมดอายุ”

อย่าแสดง “ดาวน์โหลดสำเร็จ” จากการออก URL; แสดงเพียง “เริ่มดาวน์โหลดแล้ว”

### ไฟล์บนเครื่องนี้

เปลี่ยนชื่อ My Files เป็น “ไฟล์บนเครื่องนี้” เพราะไม่มีบัญชีหรือรายการรวมจากเซิร์ฟเวอร์ รายการมาจาก owner capabilities ที่ browser เก็บในเครื่องนี้ แล้ว fetch metadata เฉพาะ id ที่มีหลักฐานจัดการ

คงขนาด/วันหมดอายุ/ลบ/เปลี่ยนอายุ/คัดลอกรหัส เพิ่ม badge ผู้รับเดียว/หลายผู้รับ และ single claimed/unclaimed ไม่แสดง unique people หรือ download completed count เพราะยืนยันไม่ได้

เมื่อไม่มีรายการ: “ยังไม่มีไฟล์จากเบราว์เซอร์นี้” พร้อมคำอธิบายว่าล้างข้อมูล browser หรือใช้เครื่องใหม่จะไม่เห็นรายการเดิม แต่ใช้ลิงก์จัดการที่เก็บไว้เปิดรายการนั้นได้

ลิงก์จัดการ `/manage#id=<uuid>&owner=<secret>` อ่าน fragment แล้ว replaceState ล้างก่อนเรียก API เช่นเดียวกับ receive link หน้านี้ต้องระบุว่าเป็นลิงก์สำหรับเจ้าของและไม่เสนอเป็นลิงก์แชร์

## 5. สิทธิ์แบบไม่ใช้บัญชี

### Owner capability

browser สุ่ม `ownerToken` 32 bytes ด้วย Web Crypto และ `Idempotency-Key` UUID **ก่อน** POST create; เก็บ pending intent รวมทั้งสองค่าก่อนส่ง ไม่รอ server ออก token เพื่อให้ retry เมื่อคำตอบหลุดได้

POST create ส่ง owner token ใน `X-Transfer-Owner-Token`; Worker hash ด้วย SHA-256 เก็บเฉพาะ hash ใน transfer และ bind idempotency record กับ hash นี้ ห้ามใช้ UUID หรือ ukid เป็น owner proof

header เดิมใช้กับทุก endpoint จัดการและ upload รวม parts/complete/delete; request idempotency key เดิม+bodyเดิม+owner proofเดิมคืน session เดิม; owner proofผิดคืน 404 ไม่เผยว่ามีรายการอยู่; payloadต่างภายใต้ proofที่ถูกต้องคืน409

localStorage เก็บ `{id,ownerToken,createdAt}` และ pending request intents; server เก็บ code hash/encrypted code และ owner hash เท่านั้น localStorage ไม่ใช่ที่ป้องกัน XSS จึงคง CSP และไม่รัน HTML/ไฟล์จากผู้ใช้

หาก storage ใช้ไม่ได้ ให้ใช้ memory ชั่วคราวและแสดงคำเตือนให้คัดลอกลิงก์จัดการเมื่อสร้างรายการสำเร็จ หาก token หายและไม่มีลิงก์สำรองจะกู้สิทธิ์จัดการผ่าน ukid ไม่ได้ ไฟล์ยังหมดอายุตามเดิม; forever ต้องให้ผู้ดูแลระบบลบผ่าน storage/runbook ในกรณีเจ้าของทำ token หาย

### Receiver capability สำหรับ single

browser สุ่ม `receiverToken` 32 bytes และ `claimRequestId` UUID **ก่อน** POST claim และเก็บ pending record `{transferId, canonicalCode, receiverToken, claimRequestId, state:'pending'|'confirmed'}` ใน sessionStorage ที่ scope ด้วย transfer id พร้อม active transfer pointer ของหน้า Receive; เก็บก่อนส่งเพื่อกู้จาก response loss ได้ ไม่เก็บ signed URL

หลัง reload ที่ URL fragment ถูกล้างแล้ว ให้ใช้ active pointer restore record และกรอกรหัสคืนจาก canonicalCode เรียก resolve พร้อม receiver header เพื่อดึง metadata/receiverStatus ใหม่; หากยัง pending ให้ retry claim ด้วย code/token/requestId ชุดเดิม ถ้าเปิด receive link ใหม่ที่มี code ให้ code จากลิงก์นั้นมีลำดับสูงกว่ารายการ active เดิม ผล mine/claimed ต้องยืนยันจาก server ไม่ใช่แค่มี local token; 409 จากการแพ้ claim ให้ล้าง pending record ของคำขอที่แพ้ ไม่ล้างสิทธิ์ของรายการอื่น

server เก็บเฉพาะ receiver hash ต่อไฟล์ single เมื่อ claim สำเร็จ ไม่มี email/IP/browser fingerprint เป็นตัวตัดสินผู้รับ การ reload ใน tab เดิมเก็บสิทธิ์ต่อได้; ปิด tab/ล้าง sessionStorage อาจเสียสิทธิ์ ไม่มีการกู้จาก ukid ให้ใครก็ได้เพราะจะทำลายความเป็น single

หาก sessionStorage ใช้ไม่ได้ ให้ใช้ memory ชั่วคราวและแจ้งก่อน claim ว่าต้องเก็บ tab นี้ไว้ ขณะที่หลายผู้รับไม่ต้องเก็บ receiver secret

receiver token เป็นหลักฐานผู้ถือสิทธิ์ สามารถถูกคัดลอกส่งต่อได้ จึงไม่รับรองหนึ่งคนจริงหรือหนึ่งเครื่องที่พิสูจน์ตัวตนแล้ว signed GET เองก็เป็น bearer URL อายุสั้นเช่นเดิม

## 6. Semantics และ state machine

Transfer state เดิม: allocating -> uploading -> finalizing -> ready -> deleting -> deleted ห้ามเพิ่ม claimed เป็น state แทน ready เพราะจะทำ cleanup/accounting ที่มีอยู่ผิด ใช้ข้อมูล receiver แยกกัน

Share mode: `single | multiple`, immutable หลัง reserve

Claim state ของ single derive จาก receiver_token_hash: null = unclaimed, non-null = claimed การ claim ไม่เปลี่ยน ready_at, expires_at, retention, size หรือ reserved/stored counters

Atomic claim RPC ใน transaction เดียว:

1. lock transfer row ตาม lock order เดิม; ตรวจ ready, expiry ด้วยเวลาฐานข้อมูล และ share_mode=single
2. หากยังไม่ claim ให้ตั้ง receiver hash + claimRequestId + claimed_at พร้อม audit event
3. หาก hash และ claimRequestId ตรงกับที่บันทึกแล้ว ให้คืน successful claim เดิม (idempotent response-loss recovery)
4. หาก hash ต่างกันหรือ request id ต่างจาก claim เดิม ให้คืน 409 FILE_ALREADY_CLAIMED โดยไม่มี metadata
5. เมื่อสอง browser claim พร้อมกันต้องสำเร็จหนึ่งเดียว ไม่มี check-then-write สอง RPC

download RPC ของ single ต้องตรวจ receiver proof และ ready/expiry ใหม่ทุกครั้ง; มี code อย่างเดียวไม่พอ ส่วน multiple ตรวจ ukid ทุกครั้งและไม่มี receiver cap เจ้าของอาจดาวน์โหลดของตัวเองด้วย owner proof โดยไม่ consume receiver slot

การลบแข่งกับ claim/download: transaction ที่ lock ก่อนเป็นผู้กำหนดผล; หลัง deleting ห้าม claim หรือออก URL ใหม่ แต่ URL/stream ที่ออกไปแล้วมีข้อจำกัด revoke เช่น v1 ไม่ลบทันทีเมื่อ claim, ไม่ลบเพียงเพราะออก URL, ไม่เปลี่ยน single เป็น multiple หลัง claim และไม่มี reset claim ในรุ่นนี้

## 7. API v2

ทั้งหมดเป็น same-origin API ไม่มี Supabase bearer JWT/browser auth SDK; JSON body มีเพดาน 16 KiB ยกเว้น multipart part stream; private R2 และ service-only DB RPC เหมือนเดิม

Header ที่เป็น secret: `X-Transfer-Owner-Token`, `X-Transfer-Receiver-Token`; ห้าม log header/body/URL fragment และห้ามใช้ query string ส่ง token

| Method / Path | Proof / body | ผล |
| --- | --- | --- |
| POST /api/transfers | owner header + Idempotency-Key; {name,sizeBytes,retention,shareMode} | UploadSessionView เดิม + shareMode |
| POST /api/transfers/:id/parts | owner header; {partNumbers} | parts เดิม |
| PUT /api/transfers/:id/part/:part | owner header; stream | bounded proxy เดิม |
| POST /api/transfers/:id/complete | owner header; {} | ReadyView เดิม + shareMode |
| GET /api/transfers/:id | owner header | metadata/status/claim status; ไม่มี raw secret |
| POST /api/transfers/:id/code | owner header | ukid สำหรับ copy ซ้ำ |
| PATCH /api/transfers/:id | owner header; {retention} | metadata ใหม่; ห้าม shareMode ใน payload |
| DELETE /api/transfers/:id | owner header | 202 deleting แบบ idempotent |
| POST /api/transfers/resolve | {code}; receiver header optional | metadata + shareMode + receiverStatus unclaimed/mine/not-required |
| POST /api/transfers/:id/claim | receiver header; {code,claimRequestId} | {id,claimed:true}; ไม่มี signed URL ใน transaction |
| POST /api/transfers/:id/download | single: receiver header; multiple: {code}; owner: owner header | short signed GET |

Claim endpoint ปฏิเสธ multiple ด้วย409 MODE_MISMATCH; resolve single claimed ของคนอื่นคืน409 FILE_ALREADY_CLAIMED โดยไม่คืน metadata; invalid code/wrong owner/wrong receiver/legacy id/expired/deleted คืน404 safe error; quotas/rates ยัง409/429; invalid payload400; unavailable503

ถ้าส่ง owner proof มาผิด ห้าม fallback ไปใช้ receiver/code branch เพื่อช่วยให้คำขอที่ตั้งใจจัดการผ่านผิดสิทธิ์ API schema ต้องไม่รับ userId จาก client

ตัด GET /api/me และ GET /api/transfers แบบ server listing; ไม่เปิด endpoint ให้ enumerate ไฟล์ทั้งหมด UI ใช้ local ids เรียก GET owned ทีละรายการเป็นหน้า 25 โดย concurrency3 และเริ่ม fetch เมื่อเปิด Files เท่านั้น ไม่สร้าง public budget endpoint แสดง usage เฉพาะ owner response ที่ตรวจ proof แล้วหรือซ่อน summary เมื่อยังไม่มีไฟล์

## 8. Database และ migration

เพิ่ม migration ใหม่ `202611130002_anonymous_sharing.sql` ไม่เขียนทับ migration v1 ที่อาจมีผู้นำไปใช้แล้ว

- transfers: เพิ่ม owner_token_hash (64 hex), share_mode, receiver_token_hash nullable, receiver_claim_request_id UUID nullable, claimed_at nullable; owner_id ของเดิม nullable สำหรับ anonymous rows
- constraint: row ใหม่ที่ anonymous ต้องมี owner hash+share_mode; single claimed ต้องมี hash/requestId/claimedAt ครบ; multiple ห้ามมี receiver claim fields
- แถว v1 ที่มี owner_id แต่ไม่มี owner hash = legacy; **ห้ามแปลงเป็น anonymous โดยปล่อยให้ code เดิมเปิดได้อัตโนมัติ** ต้องไม่ถูก resolve/claim/download ผ่าน v2
- idempotency: anonymous key UUID + owner hash + normalized body fingerprint (รวม shareMode), เก็บตามระยะเดิม; secret ผิดอย่าให้รู้ผล replay
- rate_windows: เปลี่ยน identity เป็น rate_key text ที่ไม่อ้าง auth.users; แยก action buckets
- access_events: actor แบบ owner/receiver/anonymous-system แทน userId ไม่บันทึก secret, raw IP หรือ claim token
- ใช้ dispatcher ใหม่ `public.transfer_rpc_v2` service-only search_path ตายตัว/revoke anon/authenticated เหมือน v1; ห้ามแค่เอา middleware Auth ออกแล้วใช้ RPC เดิมที่สมมติ uid
- storage_budget/jobs/leases/reconciliation คงเดิม และใช้ share mode/claim เฉพาะ access checks ไม่แตะ accounting invariants

ก่อน deploy ตรวจว่ามี v1 data จริงหรือไม่ baseline นี้ยังไม่ได้ deploy; หากมี legacy ให้ operator เลือกลบ/หมดอายุตาม policy เดิม หรือทำ migration เฉพาะที่มีหลักฐานเจ้าของ ห้าม generate management secrets ให้ผู้ใช้ทั่วไปจาก ukid

Deploy แบบ expand -> Worker v2 -> revoke v1 service RPC หลังหยุด v1 instances/rollback window ตาม runbook; ไม่มี account access บน v2 แม้ยังเก็บตาราง members เก่าไว้เพื่อความเข้ากันได้

## 9. Rate limits และการควบคุมพื้นที่เมื่อไม่มีบัญชี

คง budget 8 GiB, multipart bounded, hard upload deadline2h และ cleanup เดิม; การไม่มีบัญชีไม่ทำให้ quota หาย

ใช้ IP จาก trusted Cloudflare request metadata เท่านั้น hash ด้วย HMAC-SHA256 โดย secret `RATE_KEY_SECRET` + UTC date; ไม่รับ X-Forwarded-For เป็น identity โดยตรง; local test inject fixture ผ่าน test adapter ไม่ใช่ production bypass

ค่าเริ่มต้นเสนอ: create10/min/IP, resolve+claim30/min/IP, API รวม600/min/IP, pending uploads สูงสุด3/IP; ตัวเลข API สูงกว่า v1 เพราะองค์กรอาจออก NAT ร่วมกันและ multipart ต้องหลายคำขอ เปิด config ให้ปรับได้ ห้ามนับ idempotent create retry เป็น pending upload ใหม่

นับ rate/active uploads ใน DB transaction ไม่ใช้ global JS Map ใน Worker สำหรับ enforcement เก็บเฉพาะ HMAC rate key และ timestamps; rate windows ล้าง1วัน Active reservation ต้องเก็บ stable creation bucket key จน session จบเพื่อให้ cleanup ปลด pending counter ได้ถูกต้องแม้ข้ามวัน (การบังคับ per-IP concurrency ที่ขอบวันอาจนับแยก bucket ให้ระบุใน operations; global storage cap ยังบังคับเสมอ)

Fail closed ถ้า DB/rate check ไม่พร้อม; คง APP_ORIGIN validation, CSP, attachment-only และ secrets redaction CORS ไม่ใช่ account access control หากเปิดผ่านอินเทอร์เน็ตใครก็สร้างรายการได้ตาม limits นี้ ตรงกับ no-login request ไม่อ้างว่าเฉพาะองค์กรด้วย login อีกต่อไป

## 10. Acceptance ที่ต้องเพิ่ม

- เปิดเว็บใหม่ไม่มี session ก็ส่ง/รับได้ ไม่มี login/network ไป Supabase Auth และ browser bundle ไม่มี publishable key
- single resolve/GET/HEAD/link preview ไม่ consume; simultaneous claims2คำขอสำเร็จ1และ409อีก1 ด้วย PostgreSQL transactionจริง
- claim commitแล้วresponseหลุด retry ด้วย pending token/requestId เดิมได้ ไม่จองให้คนใหม่
- single tokenเดิมกด download ซ้ำได้, ukidอย่างเดียว/UUIDอย่างเดียว/receiverอื่นไม่ได้; tokenไม่ถูกlog
- multiple รับจากสองbrowserได้และไม่ตั้ง claimed_at; owner ยังจัดการได้แต่ผู้รับทำไม่ได้
- owner proofเดิม+idempotency keyเดิม replay create ได้; proofผิดไม่เปิดเผยข้อมูล; retryไม่เพิ่มquota/pending counts
- expiry/deleteชนะแล้ว claim/downloadใหม่ไม่ได้, foreverไม่ถูกลบเพียงเพราะclaim
- browser storage unavailable มีข้อความและ memory fallback; reload tabเดิมรักษาreceiver pending/claim, local owner historyเฉพาะเครื่อง
- share mode immutableหลังcreate; dark/light/system/mobile/keyboardยังผ่าน
- legacy v1 rowsไม่กลายเป็นไฟล์เปิดสาธารณะ; anon/authenticated DB rolesเรียก v2 RPC ไม่ได้
- ไม่มี regression ของ checksum signing, ambiguous complete recovery, network budget, generation fencing และ cleanup retry ที่ผ่านใน baseline

## 11. งานที่ยังไม่ได้ทำในคำขอนี้

เอกสารนี้เดิมเป็นdesign-only ต่อมาผู้ใช้ยืนยันให้แก้ตัวแอปจริงแล้ว จึงimplementตามhandoffนี้ โดยยังไม่deployและต้องรันmigration0002บนฐานข้อมูลจริง ผลทดสอบv1ไม่ใช่หลักฐานv2 ดูledgerและacceptanceล่าสุด
