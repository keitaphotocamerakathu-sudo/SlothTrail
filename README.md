# Trail RC Challenge v1

ระบบเว็บสำหรับกิจกรรมเดินเทรลค้นหา RC ด้วย QR Code ใช้ Supabase เป็นฐานข้อมูลและ Backend

## สิ่งที่มีใน v1

- Multi Event: สร้าง/แก้ไข/Soft Delete Event จากหน้า Admin
- Registration Builder: เพิ่ม/แก้ไข/ลบช่องสมัครจากเว็บ
- สมัครเป็นทีมตาม `team_size` ของ Event (ค่าเริ่มต้น 2 คน)
- Team Code + Team Access Key แยกแต่ละทีม
- RC Manager: เพิ่ม/แก้ไข/ลบ RC ไม่จำกัด
- QR จริง / QR หลอก พร้อมคะแนนหักและข้อความหลอก
- QR Manager เปิด/พิมพ์ซ้ำและ revoke QR จากหน้าเว็บ
- Start Queue: สร้างเวลาปล่อยตัวอัตโนมัติจากเวลาเริ่ม Event และช่วงนาที
- ปล่อยตัวทีมจากหน้า Admin
- Race Mode Mobile-first + กล้องสแกน QR
- Verify QR ผ่าน Supabase Edge Function (ไม่เชื่อผลจาก JavaScript ฝั่งมือถือ)
- ตรวจ QR ซ้ำ / QR ผิด / ผิดลำดับ / เปิด-ปิดเวลา / GPS radius
- Scan Log + Team Progress + คะแนน
- Live Scan ใน Admin ผ่าน Supabase Realtime
- LINE LIFF bind ทีม ↔ LINE User ID ผ่าน `line-bind.html`
- LINE Flex Push อยู่ใน Edge Function `verify-qr`

## โครงสร้างไฟล์

- `index.html` หน้า Event สาธารณะ
- `register.html` หน้าสมัคร
- `race.html` Race Mode สำหรับผู้แข่งขัน
- `line-bind.html` ผูกทีมกับ LINE ผ่าน LIFF
- `admin/login.html` Admin Login
- `admin/index.html` Admin Web App
- `assets/app.css` UI ทั้งระบบ
- `js/config.js` Supabase URL / Publishable key
- `js/admin.js` Admin logic
- `supabase/schema.sql` Database / RLS / RPC
- `supabase/functions/verify-qr/index.ts` ตรวจ QR + LINE Flex
- `supabase/functions/bind-line/index.ts` ผูก LINE กับทีม

## ติดตั้งครั้งแรก

1. สร้าง Supabase Project
2. รัน `supabase/schema.sql` ครั้งเดียว
3. แก้ `js/config.js`
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
4. Deploy Edge Functions `verify-qr` และ `bind-line`
5. ตั้ง Edge Function secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `LINE_CHANNEL_ACCESS_TOKEN` (เมื่อใช้ LINE)
6. เปิดเว็บ `admin/login.html` แล้วกด “สร้างบัญชีผู้ดูแลครั้งแรก” ได้จากหน้าเว็บ
7. เข้าสู่หน้า Admin แล้วกด “รับสิทธิ์ Super Admin คนแรก”
8. ถ้าใช้ LINE ให้สร้าง LIFF app หนึ่งครั้ง แล้วใส่ `LINE_LIFF_ID` ใน `js/config.js`

> หลังติดตั้งโครงสร้างครั้งแรก การสร้าง Event, แบบสมัคร, RC, QR, ทีม, เวลาออกตัว และกติกาหลักทำผ่านหน้าเว็บ Admin ได้

## หมายเหตุด้านความปลอดภัย

- QR เก็บเฉพาะ SHA-256 hash ในฐานข้อมูล ตัว Token จริงแสดงตอนสร้าง QR เท่านั้น
- Team Access Key เก็บเฉพาะ SHA-256 hash
- LINE Channel Access Token ต้องอยู่ใน Edge Function secret ห้ามใส่ใน JavaScript หน้าเว็บ
- Checkpoint รวมถึงพิกัด GPS ไม่เปิดให้ anon อ่านตรงจาก Data API

## ขั้นถัดไปที่ควรต่อก่อน Production

- Admin Users / Event Roles จากหน้าเว็บ
- LINE Integration Settings/Test Message จากหน้าเว็บโดยไม่เปิดเผย token
- QR Print Center (A4/สติกเกอร์) และ regenerate/revoke token
- Payment/slip workflow
- Ranking rules / tie-break / DQ / manual score adjustment UI
- Check-in / BIB / export Excel
- Atomic scan transaction ใน PostgreSQL RPC เพื่อรองรับสแกนพร้อมกันจำนวนมาก
- Audit log ทุกการแก้ไขจาก Admin
