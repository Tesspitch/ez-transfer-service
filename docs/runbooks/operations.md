# Operations

## Cleanup

Cron ทุกนาที claim สูงสุด 3 รายการต่อรอบ (ปรับลงจากแผน 25 เพื่ออยู่ภายใน Workers Free subrequest budget) ใช้ generation fencing และ lease; เก็บ pending deletion และยังนับ reserved/stored จน abort multipart/delete object/HEAD ตรวจหายและ DB ยืนยันสำเร็จ

ทุก invocation มี shared network budget 40 เพื่อเหลือพื้นที่จากเพดาน Free 50 สำหรับ JWKS/runtime overhead เมื่อ budget หมดงานที่ทำไม่เสร็จจะเหลือ lease แล้ว retry ได้ ไม่ release quota ปลอม Reconciliation ตรวจทีละ 3 objects/uploads ต่อหน้า พร้อม durable cursor และ grace 24 ชั่วโมง; ใช้เวลาเพิ่มเมื่อมีไฟล์มาก

รายการ ambiguous create/complete อาจคง reservation 24 ชั่วโมงเพื่อเฝ้าตรวจ object/upload ที่ตอบช้า ข้อมูล tombstone ไม่ถูกลบอัตโนมัติในรุ่นแรกเพื่อให้ reconciliation ตรวจต่อได้; audit เก็บ 30 วัน, rate windows 1 วัน, idempotency อย่างน้อย 7 วันและไม่ลบขณะ upload/job ยัง active

ลิงก์ GET อายุไม่เกิน 5 นาทีหรือเวลาที่เหลือ ไม่รับรองว่า revoke stream ที่เริ่มแล้วได้ทันที ประวัติ download_url_issued หมายถึงออก URL ไม่ใช่ยืนยันบันทึกไฟล์ปลายทาง

## สิ่งที่ต้อง monitor

- Cron heartbeat, จำนวน claimed/deleted/retried และ job เกิน 10 นาที ตั้ง alert บน query/dashboard ของผู้ให้บริการตามบัญชีจริง
- Supabase availability/paused project, RPC error rate, authentication errors
- R2 storage GB-month, request operations, ค่าใช้จ่าย; pending multipart ใช้พื้นที่ด้วย
- `stored_bytes + reserved_bytes` เทียบ object+multipart จริง; app guardrail 8 GiB ไม่ใช่ provider spending cap

หาก cron ล้มเหลว ดู Worker Issues/Logs ด้วย requestId ห้ามเปิด log raw requests/responses ที่มี URL/JWT/code หาก Supabase paused ให้ resume ผ่าน Dashboard แล้วตรวจ cron กลับมาทำงาน

## ซ่อม job ที่ค้าง

ตรวจ state, lease, upload_id และ R2 object ก่อน; ห้ามลด budget counter โดยเดา เมื่อ provider ใช้งานได้แล้ว reset due job โดย SQL Editor เฉพาะรายการที่ตรวจแล้ว:

```sql
update tt.cleanup_jobs set lease_until=null,next_attempt_at=now()
where transfer_id='VERIFIED_TRANSFER_UUID';
```

อย่าแก้ state ready กลับจาก deleting/deleted ห้ามลบแถว transfer ก่อน R2 เพราะจะสูญเสียตัวตามไฟล์; สั่ง retry ที่ id เดิมเพื่อรักษา idempotency

## ข้อจำกัด

ไม่รองรับ resume หลัง reload tab; upload ค้างหมดอายุ 2 ชั่วโมงแล้ว cleanup ไฟล์ ready ไม่หมดอายุยังนับพื้นที่จนผู้ส่งลบ ไม่มี antivirus/preview/E2EE ไฟล์ควรเป็นข้อมูลที่องค์กรอนุญาตให้เก็บภายนอกได้
