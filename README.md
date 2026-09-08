# Trail RC Challenge — LINE MINI App v2

ระบบกิจกรรมเดินเทรลค้นหา RC ด้วย QR Code โดยใช้ **LINE MINI App เป็นแอปผู้แข่งขัน**, Supabase เป็นฐานข้อมูล/Backend และ Web Admin เป็นระบบจัดการงานทั้งหมด

## สถาปัตยกรรม

```text
LINE MINI App (ผู้แข่งขัน)
  ├─ Event / Registration
  ├─ LINE identity
  ├─ Join Team
  ├─ Race Mode
  └─ QR Scan (liff.scanCodeV2)
          │ ID token
          ▼
Supabase Edge Function: miniapp-api
  ├─ Verify LINE ID token กับ LINE Platform
  ├─ Registration / Team binding
  ├─ Status
  ├─ Verify QR / GPS / Score
  └─ LINE OA Flex Push
          │
          ▼
Supabase PostgreSQL

Web Admin ── Supabase Auth + RLS ──> Supabase
```

## สิ่งที่เปลี่ยนจาก v1

- เปลี่ยนผู้แข่งขันจาก LIFF bind แบบแยกหน้าเป็น **LINE MINI App**
- ลบ `line-bind.html` และ Edge Function `bind-line`
- ผู้แข่งขันไม่ใช้ Team Access Key เป็น login หลักแล้ว
- MINI App ส่ง `ID token` ให้ `miniapp-api` และ Edge Function ตรวจ token กับ LINE Platformก่อนเชื่อข้อมูลผู้ใช้
- คนสมัครถูกผูกเป็นสมาชิกคนที่ 1 / หัวหน้าทีมโดยอัตโนมัติ
- หลังสมัคร ระบบออก **Team Invite Link** ให้สมาชิกคนอื่นเข้ามาผูก LINE กับชื่อของตนเอง
- Race Mode หา Team จาก `event_id + LINE user identity` โดยไม่ต้องพก team key ใน URL
- QR หลักใช้ `liff.scanCodeV2()` ใน LINE MINI App และมีกล้องเว็บเป็น fallback สำหรับการทดสอบ
- Flex Message ยังส่งด้วย LINE OA Messaging API จาก Edge Function เท่านั้น

## ไฟล์สำคัญ

- `index.html` หน้าแรกของ LINE MINI App / Event list
- `register.html` สมัครทีมผ่าน LINE identity
- `join.html` สมาชิกคนที่ 2+ เปิดลิงก์เชิญและผูก LINE เข้าทีม
- `race.html` Race Mode + LINE QR Scanner
- `admin/login.html` Admin Login
- `admin/index.html` Web Admin
- `js/line-miniapp.js` LIFF / MINI App session helper
- `js/config.js` Supabase + LINE MINI App LIFF ID
- `supabase/schema.sql` Database / RLS / Registration RPC
- `supabase/functions/miniapp-api/index.ts` Verify LINE + Registration + Join Team + Race + QR + Flex

## ติดตั้งครั้งแรก

### 1. Supabase

1. สร้าง Supabase Project
2. รัน `supabase/schema.sql`
3. ตั้ง `js/config.js`

```js
window.TRAIL_CONFIG = {
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'YOUR_KEY',
  APP_NAME: 'Trail RC Challenge',
  LINE_MINI_APP_LIFF_ID: 'YOUR_MINI_APP_LIFF_ID',
  LINE_MINI_APP_PERMANENT_LINK: ''
};
```

4. Deploy Edge Function:

```bash
supabase functions deploy miniapp-api
```

5. ตั้ง Edge Function secrets:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
LINE_MINI_APP_CHANNEL_ID
LINE_OA_CHANNEL_ACCESS_TOKEN
```

`LINE_OA_CHANNEL_ACCESS_TOKEN` ใช้สำหรับ Flex Push ถ้ายังไม่ใช้ Flex สามารถเว้น secret นี้ไว้ก่อน ระบบ Race/Scan ยังทำงานได้

### 2. LINE MINI App

ใน LINE Developers Console ให้สร้าง LINE MINI App และตั้งค่าครั้งแรก:

- Endpoint URL = URL root ที่วางไฟล์ระบบ เช่น `https://example.com/trail/`
- Scope ต้องมี `openid` และ `profile`
- เปิดฟีเจอร์ Scan QR / `scanCodeV2`
- ตั้ง LIFF ID ลง `LINE_MINI_APP_LIFF_ID`
- Channel ID ของ MINI App ใส่เป็น secret `LINE_MINI_APP_CHANNEL_ID` ที่ Edge Function

การตั้ง channel/endpoint เป็นการตั้งแพลตฟอร์มครั้งแรกเท่านั้น หลังจากนั้น Event, RC, QR, คะแนน, ทีม, เวลา และกติกางานจัดการผ่าน Web Admin

### 3. LINE OA สำหรับ Flex Message

ถ้าต้องการให้สแกนผ่านแล้วส่ง **Flex Message**:

- สร้าง/ใช้ LINE Official Account + Messaging API channel
- ควรวาง LINE MINI App channel และ Messaging API channel ใต้ **Provider เดียวกัน** เพื่อให้ LINE user ID ของผู้ใช้เดียวกันตรงกันข้าม channel
- ตั้ง Channel Access Token เป็น Edge Function secret `LINE_OA_CHANNEL_ACCESS_TOKEN`
- ตั้ง Add Friend Option ของ MINI App/OA ตามการใช้งานจริง เพื่อให้ OA สามารถ Push Message ถึงผู้แข่งขันได้ตามเงื่อนไข Messaging API

> Channel Access Token ห้ามใส่ใน JavaScript หรือฐานข้อมูลที่ client อ่านได้

## Flow ผู้แข่งขัน

### สมัคร

```text
เปิด LINE MINI App
→ เลือก Event
→ LINE SDK ได้ ID token
→ กรอกข้อมูลสมาชิกทีม
→ miniapp-api ตรวจ ID token กับ LINE
→ สร้าง Team + Participants
→ ผูก LINE ของผู้สมัครกับสมาชิกคนที่ 1
→ คืน Team Code + Invite Link
```

### สมาชิกคนที่ 2 เข้าทีม

```text
หัวหน้าทีมแชร์ Invite Link
→ คู่ทีมเปิดผ่าน LINE
→ ระบบตรวจ LINE ID token + Team Invite Key
→ เลือกชื่อของตัวเอง
→ ผูก LINE user กับ Participant + Team
```

Team Invite Key ใช้สำหรับ **เข้าร่วมทีมครั้งแรกเท่านั้น** ไม่ใช่ credential หลักสำหรับ Race Mode

### แข่งขัน

```text
เปิด Race Mode
→ ID token → miniapp-api
→ server หา LINE user → Team → Event
→ แสดง RC ถัดไป
→ liff.scanCodeV2()
→ QR token + GPS → server
→ ตรวจ QR / ลำดับ / เวลา / GPS / สแกนซ้ำ
→ บันทึกคะแนน
→ แสดงผลใน MINI App
→ ส่ง Flex ผ่าน LINE OA (ถ้าเปิดใช้)
```

## ความปลอดภัย

- ห้ามใช้ `liff.getProfile().userId` ที่ client ส่งมาเป็นหลักฐานยืนยันตัวตน
- Client ส่ง **ID token** เท่านั้น และ server ตรวจ token กับ LINE Platform
- `trail_submit_registration()` ถูก revoke จาก `anon`/`authenticated`; การสมัครต้องผ่าน `miniapp-api`
- `LINE_MINI_APP_CHANNEL_ID`, Service Role Key และ OA Access Token อยู่ใน Edge Function secrets
- QR ตรวจด้วย SHA-256 token hash
- Team Invite Key เก็บเป็น SHA-256 hash
- Race Mode ไม่ต้องมี Team Key ใน URL
- Admin ใช้ Supabase Auth + RLS แยกจาก LINE MINI App

## สิ่งที่ Admin ทำจากหน้าเว็บ

หลังติดตั้งครั้งแรก Admin ยังคงทำผ่านเว็บไซต์:

- Create / Edit / Duplicate / Archive Event
- Registration Form Builder
- Teams / Participants
- Start Queue / ปล่อยตัว
- RC Manager ไม่จำกัดจำนวน
- QR จริง / QR หลอก
- คะแนน / penalty
- GPS validation
- LINE notification toggle
- Live Scan
- Settings

## ก่อน Production รอบใหญ่

ควรทำต่อ:

- Atomic PostgreSQL transaction สำหรับ Scan/Score เพื่อป้องกัน race condition ตอนหลายทีมสแกนพร้อมกัน
- Admin Users / Event Roles แบบเต็ม
- Payment/Slip workflow
- QR Print Center
- Ranking + tie-break + DQ
- Audit Log
- Check-in / BIB / Export Excel
- Service Message ของ LINE MINI App (ถ้าต้องการใช้นอกเหนือจาก OA Flex และ MINI App ผ่านการ Verify แล้ว)


## Patch 2026-09-09 — readable MINI App errors

- แก้กรณีหน้าเว็บแสดง `[object Object]` เมื่อ Supabase/Edge Function ส่ง error object กลับมา
- `miniapp-api` ส่ง `message`, `code`, `details`, `hint` ที่อ่านได้
- หน้า MINI App แปลง error object เป็นข้อความก่อนแสดง Toast
- หลังอัปโหลดชุดนี้ต้อง redeploy `miniapp-api` เพื่อให้ฝั่ง server ใช้ patch ใหม่

Deploy:
```bash
supabase functions deploy miniapp-api
```

ถ้าการสมัครยังไม่ผ่าน Toast จะแสดง PostgreSQL/Supabase error ตัวจริง แทน `[object Object]`

## 2026-09-09 pgcrypto registration fix
If registration shows `function gen_random_bytes(integer) does not exist`, run:
`supabase/migrations/fix_pgcrypto_registration.sql`
This qualifies pgcrypto calls as `extensions.gen_random_bytes` and `extensions.digest`.


## v3 — Race Entry Fix

- หน้า MINI App แยก `การแข่งขันของฉัน` ออกจาก `Event ที่เปิดรับสมัคร`
- Event ที่ผู้ใช้สมัครแล้วจะยังแสดงเมื่อสถานะเป็น `ready`, `live` หรือ `finished`
- เมื่อ Event เป็น `live` ปุ่มจะเป็น `เข้าแข่งขัน` และเปิด `race.html?event=<event_id>`
- ถ้าทีมยังไม่ถูกปล่อยตัว Race Mode จะรอ Admin ปล่อยตัว; เมื่อทีมเป็น `racing` จึงสแกน QR ได้
- ลิงก์ register เดิมยังเปิดได้หลังปิดรับสมัคร: ผู้ที่สมัครแล้วจะเห็นปุ่ม Race Mode ส่วนคนที่ยังไม่สมัครจะเห็นว่าปิดรับสมัครแล้ว

> ต้อง Deploy Edge Function `miniapp-api` เวอร์ชันนี้ใหม่ เพราะเพิ่ม action `my_events` และ `event_info`
