# หลายไฟล์และเลือกก่อนส่ง

ผู้ใช้ขอส่งหลายไฟล์และติ๊กไฟล์ออกได้ ให้ทำงานจริงต่อจากno-loginv2

- File picker/drop/pasteรับหลายไฟล์และเพิ่มต่อรายการเดิมได้ แสดงชื่อ ขนาด checkbox และปุ่มเอาออกแต่ละแถว
- ไฟล์ที่เอาติ๊กออกยังอยู่ในรายการแต่ไม่ส่ง มีเลือกทั้งหมด/ไม่เลือกทั้งหมด/ลบรายการที่ไม่เลือก/ล้างทั้งหมด
- ติ๊กอย่างน้อยหนึ่งรายการจึงส่งได้; disableแก้รายการขณะเตรียมและส่ง
- เลือกหนึ่งไฟล์ส่งต้นฉบับ เลือกหลายไฟล์รวมZIPแบบไม่บีบอัดในbrowser แล้วใช้multipart/APIเดิม ทำให้หนึ่งukidครอบคลุมชุด ไม่เพิ่มschemaหรือmigration
- แสดงข้อความชัดว่าผู้รับโหลดZIPเมื่อหลายไฟล์ ไม่มีindividualfilelistingฝั่งreceiverในการเปลี่ยนนี้
- สูงสุด100รายการในqueue, ผลลัพธ์ZIP/ไฟล์เดี่ยวต้องไม่เกิน1GiB รวมZIPheadersด้วย; globalstorage8GiBเดิม
- ไฟล์ชื่อซ้ำในZIPเติม (2),(3)ก่อนextension ไม่เขียนทับ และห้ามarchivepathtraversal; รองรับชื่อไทย
- Zero-byteไม่รับตามAPIเดิม; ไฟล์เสีย/เกินเพดานไม่ทิ้งรายการที่ถูกต้องที่มีอยู่
- เตรียมZIPมีprogressและcancel ก่อนเรียกAPI; ZIPเสร็จแล้วค่อยเริ่มนับuploadprogress/retentionตามเดิม ใช้stream/Blob APIไม่อ่านทุกไฟล์เป็นarrayพร้อมกัน
- คงowner/receivercapabilities, single/multiple, dark/light/mobile และfailure recoveryเดิม

Implementation: selection.tsดูแลqueue/checkbox/ขนาด; bundle.tsใช้dynamicimportzip.js BlobReader/BlobWriter, level0, AbortSignal; Send.tsxใช้queue snapshotและส่งFileที่ได้เข้าuploadFileเดิม

Verification: unit testsสำหรับselection/limits/ZIPcontents/ชื่อซ้ำ/ยกเลิก; Playwrightเลือก3ติ๊กออก1แล้วunzippayloadจริงตรวจเหลือ2, drag/dropเพิ่มต่อ, ไม่มีselectionส่งไม่ได้, clear/remove, dark/light/mobile; typecheck/lint/buildและsuiteเดิมต้องผ่าน
