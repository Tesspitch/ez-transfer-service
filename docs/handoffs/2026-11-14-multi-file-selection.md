# Handoff — หลายไฟล์และเลือกก่อนส่ง

อ้างอิง [spec](../superpowers/specs/2026-11-13-multi-file-selection.md)

File picker, drop และ paste เพิ่มหลายไฟล์ต่อรายการเดิมได้ มี checkbox เลือกก่อนส่ง เลือกทั้งหมด/เอาเครื่องหมายออกทั้งหมด ลบรายการที่ไม่ได้เลือก ลบรายไฟล์และล้างทั้งหมด การเอาติ๊กออกไม่ลบไฟล์ต้นฉบับจากเครื่อง

หนึ่งไฟล์ส่งต้นฉบับ หลายไฟล์รวมเป็น ZIP ไม่บีบอัดบน browser แล้วส่งผ่าน multipart uploader เดิม ใช้ ukid เดียว ผู้รับดาวน์โหลด ZIP ทั้งชุด ไม่มีรายการเลือกดาวน์โหลดแยกฝั่งผู้รับในการเปลี่ยนนี้

สูงสุด 100 รายการต่อคิว ผลลัพธ์ ZIP รวม headers หรือไฟล์เดี่ยวไม่เกิน 1 GiB ไฟล์ว่างและไฟล์เกินขนาดถูกปฏิเสธโดยไม่ล้างคิวที่ถูกต้อง เตรียม ZIP มี progress/cancel ชื่อซ้ำเติมลำดับและแทนที่ path separator เพื่อไม่สร้าง directory traversal ใช้ Blob/stream API และโหลด zip.js เฉพาะเมื่อรวมหลายไฟล์ ทั้งนี้การเตรียม ZIP ยังใช้ทรัพยากรเครื่องผู้ส่ง และยังไม่ได้ทดสอบ ZIP ขนาดเต็ม 1 GiB บนอุปกรณ์จริง

ไฟล์หลัก: `src/web/features/send/selection.ts`, `bundle.ts`, `Send.tsx`, `src/web/styles/app.css` เพิ่ม dependency `@zip.js/zip.js` ไม่เปลี่ยน backend, schema, environment variables, auth หรือ retention

Verification: unit/database suite 38/38 ผ่าน; Chrome browser suite 8/8 ผ่าน ตรวจ payload PUT จริงแล้วอ่าน ZIP ยืนยันชื่อและเนื้อหาเฉพาะสองไฟล์ที่เลือกจากสามรายการ ตรวจ picker/drop/paste append, toggle all, empty file rejection, delete, clear และชื่อยาวที่ความกว้าง 375px ใน dark/light ภาพอยู่ `test-results/multi-file-dark-mobile.png` และ `test-results/multi-file-light-mobile.png` Typecheck/lint/build ผ่าน; reviewer ไม่พบประเด็นค้าง Browser API เป็น mock จึงไม่ใช่หลักฐานว่าอัปโหลดจริงเข้า R2 ผ่าน

Deployment: build/deploy frontend ตาม flow เดิม ไม่ต้องเพิ่ม migration สำหรับหลายไฟล์ แต่ deployment ที่ยังใช้ schema v1 ต้องรัน migration 0002 ของ no-login จากงานก่อนหน้าอยู่ ไม่แก้ `.env` ของผู้ใช้และไม่ deploy อัตโนมัติ
