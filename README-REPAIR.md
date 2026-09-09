# Trail RC v9 — Admin Repair + RC Map Fix

## สาเหตุที่หน้า Admin กดอะไรไม่ได้
หน้า `admin/index.html` เรียกไฟล์ต่อไปนี้:
- `js/config.js`
- `js/supabase-client.js`
- `js/common.js`
- `js/admin.js`

แต่ repository ปัจจุบันเหลือในโฟลเดอร์ `js` เพียง `admin.js` ทำให้ `window.trailDb` / `window.TrailUI` ไม่ถูกสร้าง และ Admin JavaScript หยุดตั้งแต่เริ่มต้น

นอกจากนี้ `admin/login.html` ก็หายไป ทำให้เมื่อ session หมดอายุจะกลับไปหน้า Login ไม่ได้

## ไฟล์ที่ชุดนี้คืนให้
- `admin/index.html`
- `admin/login.html`
- `assets/app.css`
- `js/admin.js`
- `js/config.js`
- `js/supabase-client.js`
- `js/common.js`
- `js/line-miniapp.js`
- หน้า MINI App เดิม: `index.html`, `register.html`, `join.html`, `race.html`

## แผนที่
- ใช้ Leaflet CSS/JS จาก jsDelivr โดยไม่มี SRI ที่ผิด
- เอา CSS hack ที่บังคับ tile ออก
- Map container responsive บนมือถือ
- จุด RC ยังแตะปักหมุด / ลากหมุด / ใช้ตำแหน่งปัจจุบันได้

## วิธีอัปเดต GitHub
อัปโหลดไฟล์/โฟลเดอร์ทั้งหมดใน ZIP ทับ repository โดยรักษาโครงสร้างเดิม
**อย่าลบ `js` แล้วอัปโหลดเฉพาะ admin.js**

หลัง GitHub Pages deploy แล้ว เปิด:
`/SlothTrail/admin/index.html?v=repair9`

ถ้า session หมดอายุ ระบบจะไป `/SlothTrail/admin/login.html`

รอบนี้ไม่ต้อง Run SQL และไม่ต้อง Deploy Edge Function เพิ่ม
