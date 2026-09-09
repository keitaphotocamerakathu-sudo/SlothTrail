(() => {
  const db = window.trailDb;
  const UI = window.TrailUI;
  const state = { user:null, isAdmin:false, events:[], eventId:null, checkpoints:[], teams:[], fields:[], realtime:null };
  let checkpointMap=null, checkpointMarker=null;
  const $ = id => document.getElementById(id);

  async function boot(){
    const {data:{session}} = await db.auth.getSession();
    if(!session){ location.href='./login.html'; return; }
    state.user=session.user;
    bindNav(); bindModals(); bindActions();
    const allowed = await ensureAdminAccess();
    if(!allowed) return;
    await loadEvents();
  }

  async function ensureAdminAccess(){
    // Normal case: this account is already an active Trail RC admin.
    const {data:isAdmin,error:checkError}=await db.rpc('trail_is_admin');
    if(checkError){
      lockAdminUi('ตรวจสอบสิทธิ์ Admin ไม่สำเร็จ: '+checkError.message);
      return false;
    }
    if(isAdmin){
      state.isAdmin=true;
      if($('claimAdminBtn')) $('claimAdminBtn').style.display='none';
      return true;
    }

    // First-run bootstrap: the very first authenticated account becomes Super Admin.
    // The database function itself refuses this once any admin already exists.
    const displayName=(state.user.user_metadata?.display_name || state.user.email?.split('@')[0] || 'Super Admin').trim();
    const {error:claimError}=await db.rpc('trail_claim_first_admin',{p_display_name:displayName});
    if(!claimError){
      // Never trust a successful-looking bootstrap until the DB confirms the role.
      const {data:confirmed,error:confirmError}=await db.rpc('trail_is_admin');
      if(confirmError || !confirmed){
        lockAdminUi('ฐานข้อมูลยังไม่ยืนยันสิทธิ์ Admin กรุณารัน migration repair_admin_event_rls.sql แล้ว Login ใหม่');
        return false;
      }
      state.isAdmin=true;
      if($('claimAdminBtn')) $('claimAdminBtn').style.display='none';
      UI.toast('ตั้งบัญชีนี้เป็น Super Admin คนแรกแล้ว','success');
      return true;
    }

    if(String(claimError.message||'').includes('ADMIN_ALREADY_EXISTS')){
      lockAdminUi('บัญชีนี้ยังไม่มีสิทธิ์จัดการ Trail RC และระบบมี Super Admin คนแรกอยู่แล้ว กรุณาให้ Super Admin เพิ่มสิทธิ์บัญชีนี้จากหน้า Users / Admin Roles');
    }else{
      lockAdminUi('รับสิทธิ์ Admin ไม่สำเร็จ: '+claimError.message);
    }
    return false;
  }

  function lockAdminUi(message){
    state.isAdmin=false;
    ['newEventBtn','newEventTopBtn','claimAdminBtn'].forEach(id=>{const el=$(id);if(el){el.disabled=true;el.title=message;}});
    const box=$('eventsTable');
    if(box) box.innerHTML=`<div class="empty panel"><strong>ไม่มีสิทธิ์ Admin</strong><div class="help" style="margin-top:8px">${UI.esc(message)}</div></div>`;
    UI.toast(message,'error');
  }

  function bindNav(){
    document.querySelectorAll('#sideNav button').forEach(btn=>btn.addEventListener('click',()=>{
      document.querySelectorAll('#sideNav button').forEach(b=>b.classList.toggle('active',b===btn));
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      $(`page-${btn.dataset.page}`).classList.add('active');
      if(btn.dataset.page==='scans') loadScans();
    }));
  }
  function bindModals(){
    document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).classList.remove('show')));
    document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('show')}));
  }
  function bindActions(){
    $('logoutBtn').addEventListener('click',logout); $('logoutMobileBtn').addEventListener('click',logout);
    $('claimAdminBtn').addEventListener('click',claimAdmin);
    $('newEventBtn').addEventListener('click',()=>openEvent()); $('newEventTopBtn').addEventListener('click',()=>openEvent());
    $('eventForm').addEventListener('submit',saveEvent);
    $('eventSwitcher').addEventListener('change',async e=>selectEvent(e.target.value));
    $('newFieldBtn').addEventListener('click',()=>openField());
    $('fieldForm').addEventListener('submit',saveField);
    $('newCheckpointBtn').addEventListener('click',()=>openCheckpoint());
    $('checkpointForm').addEventListener('submit',saveCheckpoint);
    $('checkpointGpsRequired').addEventListener('change',toggleCheckpointGps);
    $('checkpointMyLocation').addEventListener('click',useCurrentCheckpointLocation);
    $('checkpointClearLocation').addEventListener('click',clearCheckpointLocation);
    $('generateSlotsBtn').addEventListener('click',generateSlots);
    $('refreshScansBtn').addEventListener('click',loadScans);
    $('refreshQrsBtn').addEventListener('click',loadQrs);
    $('settingsForm').addEventListener('submit',saveSettings);
  }
  async function logout(){ await db.auth.signOut(); location.href='./login.html'; }
  async function claimAdmin(){
    const name=prompt('ชื่อที่แสดงสำหรับ Super Admin','Super Admin'); if(name===null)return;
    const {error}=await db.rpc('trail_claim_first_admin',{p_display_name:name});
    if(error){UI.toast(error.message.includes('ADMIN_ALREADY_EXISTS')?'มีผู้ดูแลระบบคนแรกแล้ว และบัญชีนี้ยังไม่ได้รับสิทธิ์':error.message,'error');return;}
    state.isAdmin=true;
    if($('claimAdminBtn')) $('claimAdminBtn').style.display='none';
    UI.toast('รับสิทธิ์ Super Admin สำเร็จ','success'); await loadEvents();
  }

  async function loadEvents(){
    const {data,error}=await db.from('trail_events').select('*').is('deleted_at',null).order('created_at',{ascending:false});
    if(error){ renderDbError('eventsTable',error); return; }
    state.events=data||[];
    renderEvents();
    const requested=new URLSearchParams(location.search).get('event');
    const next=(state.eventId&&state.events.some(e=>e.id===state.eventId))?state.eventId:((requested&&state.events.some(e=>e.id===requested))?requested:(state.events[0]?.id||''));
    $('eventSwitcher').innerHTML=state.events.length?state.events.map(e=>`<option value="${e.id}">${UI.esc(e.name)}</option>`).join(''):'<option value="">ยังไม่มี Event</option>';
    if(next){$('eventSwitcher').value=next;await selectEvent(next,false)} else {state.eventId=null;clearEventDependent();}
  }
  async function selectEvent(id,updateUrl=true){
    state.eventId=id||null;
    if(updateUrl&&id){const u=new URL(location.href);u.searchParams.set('event',id);history.replaceState({},'',u)}
    await Promise.all([loadDashboard(),loadFields(),loadCheckpoints(),loadQrs(),loadTeams(),loadSettings()]);
    startRealtime();
  }
  function currentEvent(){return state.events.find(e=>e.id===state.eventId)||null}
  function clearEventDependent(){
    $('fieldsTable').innerHTML='<div class="empty">สร้าง Event ก่อน</div>';
    $('checkpointsTable').innerHTML='<div class="empty">สร้าง Event ก่อน</div>';
    $('qrsTable').innerHTML='<div class="empty">สร้าง Event ก่อน</div>';
    $('teamsTable').innerHTML='<div class="empty">สร้าง Event ก่อน</div>';
    $('scansTable').innerHTML='<div class="empty">สร้าง Event ก่อน</div>';
    ['kpiTeams','kpiRC','kpiRacing','kpiScans'].forEach(id=>$(id).textContent='0');
  }

  function openEvent(ev=null){
    $('eventModalTitle').textContent=ev?'แก้ไข Event':'สร้าง Event';
    $('eventId').value=ev?.id||''; $('eventName').value=ev?.name||''; $('eventSlug').value=ev?.slug||''; $('eventStatus').value=ev?.status||'draft'; $('eventVenue').value=ev?.venue||''; $('eventDate').value=ev?.event_date||''; $('eventStart').value=ev?.race_start_time?.slice(0,5)||''; $('eventTeamSize').value=ev?.team_size||2; $('eventInterval').value=ev?.release_interval_minutes||5; $('eventMaxTeams').value=ev?.max_teams||''; $('eventFee').value=ev?.entry_fee||0; $('eventDescription').value=ev?.description||''; $('eventPublicReg').checked=!!ev?.public_registration_enabled;
    $('eventModal').classList.add('show');
    if(!ev) setTimeout(()=>$('eventName').focus(),50);
  }
  async function saveEvent(e){
    e.preventDefault();
    const id=$('eventId').value;
    const payload={name:$('eventName').value.trim(),slug:$('eventSlug').value.trim()||UI.slugify($('eventName').value),status:$('eventStatus').value,venue:$('eventVenue').value.trim()||null,event_date:$('eventDate').value||null,race_start_time:$('eventStart').value||null,team_size:Number($('eventTeamSize').value)||2,release_interval_minutes:Number($('eventInterval').value)||5,max_teams:$('eventMaxTeams').value?Number($('eventMaxTeams').value):null,entry_fee:Number($('eventFee').value)||0,description:$('eventDescription').value.trim()||null,public_registration_enabled:$('eventPublicReg').checked};
    let res;
    if(id){
      res=await db.from('trail_events').update(payload).eq('id',id).select().single();
    }else{
      // Create server-side so Event + Settings are atomic and do not depend on a client INSERT passing RLS.
      const rpc=await db.rpc('trail_create_event',{p_event:payload});
      const created=Array.isArray(rpc.data)?rpc.data[0]:rpc.data;
      res={data:created,error:rpc.error};
    }
    if(res.error){
      const msg=String(res.error.message||'');
      if(msg.includes('ADMIN_REQUIRED') || msg.includes('row-level security')){
        UI.toast('สิทธิ์ Admin ในฐานข้อมูลยังไม่พร้อม กรุณารัน repair_admin_event_rls.sql แล้ว Login ใหม่','error');
      }else if(msg.includes('trail_create_event')){
        UI.toast('ฐานข้อมูลยังไม่มีฟังก์ชันสร้าง Event เวอร์ชันใหม่ กรุณารัน repair_admin_event_rls.sql','error');
      }else UI.toast(msg,'error');
      return;
    }
    if(!id) state.eventId=res.data.id;
    $('eventModal').classList.remove('show'); UI.toast('บันทึก Event แล้ว','success'); await loadEvents();
  }
  function renderEvents(){
    if(!state.events.length){$('eventsTable').innerHTML='<div class="empty panel">ยังไม่มี Event — กด “สร้าง Event” เพื่อเริ่มงานแรก</div>';return;}
    $('eventsTable').innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>Event</th><th>วันที่</th><th>ทีม</th><th>ช่วงปล่อย</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${state.events.map(e=>`<tr><td><strong>${UI.esc(e.name)}</strong><div class="help">/${UI.esc(e.slug)}</div></td><td>${UI.dateTH(e.event_date)}</td><td>${e.team_size} คน</td><td>${e.release_interval_minutes} นาที</td><td>${statusBadge(e.status)}</td><td><div class="row-actions"><button class="btn mini" data-edit-event="${e.id}">แก้ไข</button><button class="btn mini" data-dup-event="${e.id}">Duplicate</button><button class="btn btn-danger mini" data-delete-event="${e.id}">ลบ</button></div></td></tr>`).join('')}</tbody></table></div>`;
    document.querySelectorAll('[data-edit-event]').forEach(b=>b.addEventListener('click',()=>openEvent(state.events.find(e=>e.id===b.dataset.editEvent))));
    document.querySelectorAll('[data-dup-event]').forEach(b=>b.addEventListener('click',()=>duplicateEvent(b.dataset.dupEvent)));
    document.querySelectorAll('[data-delete-event]').forEach(b=>b.addEventListener('click',()=>deleteEvent(b.dataset.deleteEvent)));
  }
  async function duplicateEvent(id){
    const src=state.events.find(e=>e.id===id);if(!src)return;
    const copyName=prompt('ชื่อ Event ใหม่',`${src.name} Copy`);if(copyName===null||!copyName.trim())return;
    const slugBase=UI.slugify(copyName)||`event-${Date.now()}`;
    const payload={...src};['id','created_at','updated_at','deleted_at'].forEach(k=>delete payload[k]);payload.name=copyName.trim();payload.slug=`${slugBase}-${String(Date.now()).slice(-5)}`;payload.status='draft';payload.public_registration_enabled=false;payload.created_by=state.user.id;
    const {data:newEvent,error}=await db.from('trail_events').insert(payload).select().single();if(error){UI.toast(error.message,'error');return;}
    const [st,rf,cp]=await Promise.all([
      db.from('trail_event_settings').select('*').eq('event_id',id).maybeSingle(),
      db.from('trail_registration_fields').select('*').eq('event_id',id).order('sort_order'),
      db.from('trail_checkpoints').select('*').eq('event_id',id).is('deleted_at',null).order('sort_order')
    ]);
    if(st.data){const row={...st.data,event_id:newEvent.id};await db.from('trail_event_settings').insert(row)}else await db.from('trail_event_settings').insert({event_id:newEvent.id});
    if(rf.data?.length){await db.from('trail_registration_fields').insert(rf.data.map(x=>{const y={...x,event_id:newEvent.id};delete y.id;delete y.created_at;return y}))}
    if(cp.data?.length){await db.from('trail_checkpoints').insert(cp.data.map(x=>{const y={...x,event_id:newEvent.id};delete y.id;delete y.created_at;delete y.updated_at;delete y.deleted_at;return y}))}
    UI.toast('Duplicate Event สำเร็จ (ไม่คัดลอกทีมและ QR)','success');state.eventId=newEvent.id;await loadEvents();
  }

  async function deleteEvent(id){
    const ev=state.events.find(e=>e.id===id); if(!ev)return;
    if(!await UI.confirmAction(`ย้าย Event “${ev.name}” ไปถัง Archive/ลบใช่หรือไม่? ข้อมูลจะยังไม่ถูกลบถาวร`))return;
    const {error}=await db.from('trail_events').update({deleted_at:new Date().toISOString(),status:'archived',public_registration_enabled:false}).eq('id',id);
    if(error){UI.toast(error.message,'error');return;} UI.toast('นำ Event ออกจากรายการแล้ว','success'); if(state.eventId===id)state.eventId=null; await loadEvents();
  }
  function statusBadge(s){const map={draft:['Draft','gray'],registration:['รับสมัคร','green'],ready:['พร้อมแข่ง','yellow'],live:['LIVE','green'],finished:['จบแล้ว','gray'],archived:['Archive','gray'],pending:['รอตรวจ','yellow'],approved:['อนุมัติ','green'],racing:['กำลังแข่ง','green'],cancelled:['ยกเลิก','red'],disqualified:['DQ','red'],finished_team:['จบแล้ว','gray']};const [t,c]=map[s]||[s,'gray'];return `<span class="badge badge-${c}">${t}</span>`}

  function openField(field=null){
    if(!state.eventId){UI.toast('กรุณาสร้าง/เลือก Event ก่อน','error');return;}
    $('fieldModalTitle').textContent=field?'แก้ไขช่องข้อมูล':'เพิ่มช่องข้อมูล';
    $('fieldId').value=field?.id||'';
    $('fieldKey').value=field?.field_key||'';
    $('fieldLabel').value=field?.label||'';
    $('fieldType').value=field?.field_type||'text';
    $('fieldScope').value=field?.scope||'member';
    $('fieldOptions').value=Array.isArray(field?.options)?field.options.join('|'):'';
    $('fieldSort').value=field?.sort_order??state.fields.length;
    $('fieldRequired').checked=!!field?.is_required;
    $('fieldModal').classList.add('show');
  }
  async function saveField(e){
    e.preventDefault();
    const id=$('fieldId').value;
    const options=$('fieldOptions').value.split('|').map(v=>v.trim()).filter(Boolean);
    const payload={event_id:state.eventId,field_key:$('fieldKey').value.trim(),label:$('fieldLabel').value.trim(),field_type:$('fieldType').value,scope:$('fieldScope').value,is_required:$('fieldRequired').checked,options,sort_order:Number($('fieldSort').value)||0,is_active:true};
    const res=id?await db.from('trail_registration_fields').update(payload).eq('id',id):await db.from('trail_registration_fields').insert(payload);
    if(res.error){UI.toast(res.error.message,'error');return;}
    $('fieldModal').classList.remove('show');UI.toast('บันทึกช่องสมัครแล้ว','success');await loadFields();
  }
  async function loadFields(){
    if(!state.eventId){$('fieldsTable').innerHTML='<div class="empty">เลือก Event ก่อน</div>';return;}
    const {data,error}=await db.from('trail_registration_fields').select('*').eq('event_id',state.eventId).order('sort_order');
    if(error){renderDbError('fieldsTable',error);return;}state.fields=data||[];
    if(!state.fields.length){$('fieldsTable').innerHTML='<div class="empty panel">ยังไม่มีช่องข้อมูลเพิ่มเติม ระบบมี “ชื่อ-นามสกุล” เป็นช่องพื้นฐานอยู่แล้ว</div>';return;}
    $('fieldsTable').innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>ลำดับ</th><th>ชื่อช่อง</th><th>ชนิด</th><th>ระดับ</th><th>บังคับ</th><th>จัดการ</th></tr></thead><tbody>${state.fields.map(f=>`<tr><td>${f.sort_order}</td><td><strong>${UI.esc(f.label)}</strong><div class="help">${UI.esc(f.field_key)}</div></td><td>${UI.esc(f.field_type)}</td><td>${f.scope==='team'?'ทั้งทีม':'สมาชิก'}</td><td>${f.is_required?'✓':'-'}</td><td><div class="row-actions"><button class="btn mini" data-edit-field="${f.id}">แก้ไข</button><button class="btn btn-danger mini" data-del-field="${f.id}">ลบ</button></div></td></tr>`).join('')}</tbody></table></div>`;
    document.querySelectorAll('[data-edit-field]').forEach(b=>b.addEventListener('click',()=>openField(state.fields.find(x=>x.id===b.dataset.editField))));
    document.querySelectorAll('[data-del-field]').forEach(b=>b.addEventListener('click',()=>deleteField(b.dataset.delField)));
  }
  async function deleteField(id){
    if(!await UI.confirmAction('ลบช่องข้อมูลนี้ออกจากแบบสมัคร?'))return;
    const {error}=await db.from('trail_registration_fields').delete().eq('id',id);
    if(error){UI.toast(error.message,'error');return;}await loadFields();
  }

  async function loadDashboard(){
    if(!state.eventId)return;
    const [teams,rc,scans]=await Promise.all([
      db.from('trail_teams').select('id,status',{count:'exact',head:false}).eq('event_id',state.eventId).is('deleted_at',null),
      db.from('trail_checkpoints').select('id',{count:'exact',head:false}).eq('event_id',state.eventId).is('deleted_at',null),
      db.from('trail_scan_logs').select('id',{count:'exact',head:false}).eq('event_id',state.eventId)
    ]);
    const rows=teams.data||[];$('kpiTeams').textContent=teams.count??rows.length;$('kpiRC').textContent=rc.count??(rc.data||[]).length;$('kpiRacing').textContent=rows.filter(x=>x.status==='racing').length;$('kpiScans').textContent=scans.count??(scans.data||[]).length;
    const ev=currentEvent(); $('dashboardHint').textContent=ev?`${ev.name} · ${ev.release_interval_minutes} นาที/ทีม · ${ev.team_size} คน/ทีม`:'สร้าง Event ก่อน';
  }

  function toggleCheckpointGps(){
    const required=$('checkpointGpsRequired').checked;
    $('checkpointRadiusField').style.display=required?'block':'none';
  }
  function updateCoordinateText(){
    const lat=$('checkpointLat').value, lng=$('checkpointLng').value;
    $('checkpointCoordinateText').textContent=(lat&&lng)?`📍 พิกัด RC: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`:'ยังไม่ได้ปักตำแหน่ง';
  }
  function setCheckpointLocation(lat,lng,{center=true}={}){
    lat=Number(lat);lng=Number(lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180)return;
    $('checkpointLat').value=lat.toFixed(7);$('checkpointLng').value=lng.toFixed(7);updateCoordinateText();
    if(!checkpointMap)return;
    if(!checkpointMarker){
      checkpointMarker=L.marker([lat,lng],{draggable:true,icon:L.divIcon({className:'trail-rc-div-icon',html:'<div class="trail-rc-pin"></div>',iconSize:[28,28],iconAnchor:[14,28]})}).addTo(checkpointMap);
      checkpointMarker.on('dragend',()=>{const p=checkpointMarker.getLatLng();setCheckpointLocation(p.lat,p.lng,{center:false})});
    }else checkpointMarker.setLatLng([lat,lng]);
    if(center)checkpointMap.setView([lat,lng],Math.max(checkpointMap.getZoom(),16));
  }
  function clearCheckpointLocation(){
    $('checkpointLat').value='';$('checkpointLng').value='';
    if(checkpointMarker&&checkpointMap){checkpointMap.removeLayer(checkpointMarker);checkpointMarker=null;}
    updateCoordinateText();
  }
  let checkpointMapResizeObserver=null;
  function refreshCheckpointMapSize(){
    if(!checkpointMap)return;
    const mapEl=$('checkpointMap');
    if(!mapEl||!mapEl.offsetWidth||!mapEl.offsetHeight)return;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{
        checkpointMap.invalidateSize({animate:false,pan:false});
        const pane=mapEl.querySelector('.leaflet-map-pane');
        if(pane) pane.style.willChange='transform';
      }catch(_e){}
    }));
  }
  function initCheckpointMap(){
    if(!window.L){UI.toast('โหลดแผนที่ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ต','error');return;}
    const mapEl=$('checkpointMap');
    if(!mapEl)return;
    if(!checkpointMap){
      checkpointMap=L.map(mapEl,{zoomControl:true,preferCanvas:true}).setView([7.8804,98.3923],11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        maxZoom:19,
        attribution:'&copy; OpenStreetMap contributors',
        crossOrigin:true,
        updateWhenIdle:true,
        keepBuffer:3
      }).addTo(checkpointMap);
      checkpointMap.on('click',e=>setCheckpointLocation(e.latlng.lat,e.latlng.lng));
      if('ResizeObserver' in window){
        checkpointMapResizeObserver=new ResizeObserver(()=>refreshCheckpointMapSize());
        checkpointMapResizeObserver.observe(mapEl);
      }
      window.addEventListener('resize',refreshCheckpointMapSize,{passive:true});
      window.addEventListener('orientationchange',()=>setTimeout(refreshCheckpointMapSize,180),{passive:true});
    }
    refreshCheckpointMapSize();
    [60,160,320,600,1000].forEach(ms=>setTimeout(refreshCheckpointMapSize,ms));
  }
  function useCurrentCheckpointLocation(){
    if(!navigator.geolocation){UI.toast('อุปกรณ์นี้ไม่รองรับตำแหน่ง GPS','error');return;}
    $('checkpointMyLocation').disabled=true;
    navigator.geolocation.getCurrentPosition(p=>{
      $('checkpointMyLocation').disabled=false;
      setCheckpointLocation(p.coords.latitude,p.coords.longitude);
    },err=>{
      $('checkpointMyLocation').disabled=false;
      UI.toast('อ่านตำแหน่งปัจจุบันไม่ได้ กรุณาอนุญาต Location หรือแตะบนแผนที่เอง','error');
    },{enableHighAccuracy:true,timeout:10000,maximumAge:5000});
  }
  function openCheckpoint(cp=null){
    $('checkpointModalTitle').textContent=cp?'แก้ไข RC':'เพิ่ม RC';
    $('checkpointId').value=cp?.id||'';
    $('checkpointNo').value=cp?.checkpoint_no||state.checkpoints.length+1;
    $('checkpointName').value=cp?.name||'';
    $('checkpointClue').value=cp?.clue||'';
    $('checkpointDistanceText').value=cp?.distance_text||'';
    $('checkpointPoints').value=cp?.points??50;
    $('checkpointLat').value=cp?.latitude??'';
    $('checkpointLng').value=cp?.longitude??'';
    $('checkpointGpsRequired').checked=!!cp?.gps_required;
    $('checkpointGpsRadius').value=cp?.gps_radius_meters??100;
    $('checkpointFinish').checked=!!cp?.is_finish;
    toggleCheckpointGps();updateCoordinateText();
    $('checkpointModal').classList.add('show');
    // Leaflet must measure the map only after the modal is visibly laid out.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      initCheckpointMap();
      if(cp?.latitude!=null&&cp?.longitude!=null)setCheckpointLocation(cp.latitude,cp.longitude);
      else if(checkpointMarker&&checkpointMap){checkpointMap.removeLayer(checkpointMarker);checkpointMarker=null;}
      refreshCheckpointMapSize();
    }));
  }
  async function saveCheckpoint(e){
    e.preventDefault(); const id=$('checkpointId').value;
    const gpsRequired=$('checkpointGpsRequired').checked;
    const lat=$('checkpointLat').value?Number($('checkpointLat').value):null;
    const lng=$('checkpointLng').value?Number($('checkpointLng').value):null;
    if(gpsRequired&&(lat==null||lng==null)){UI.toast('RC จุดนี้เปิดตรวจ GPS กรุณาปักตำแหน่งบนแผนที่ก่อนบันทึก','error');return;}
    const payload={event_id:state.eventId,checkpoint_no:Number($('checkpointNo').value),name:$('checkpointName').value.trim(),clue:$('checkpointClue').value.trim()||null,distance_text:$('checkpointDistanceText').value.trim()||null,points:Number($('checkpointPoints').value)||0,latitude:lat,longitude:lng,gps_required:gpsRequired,gps_radius_meters:Math.min(5000,Math.max(10,Number($('checkpointGpsRadius').value)||100)),is_finish:$('checkpointFinish').checked,sort_order:Number($('checkpointNo').value)};
    const res=id?await db.from('trail_checkpoints').update(payload).eq('id',id):await db.from('trail_checkpoints').insert(payload);
    if(res.error){UI.toast(res.error.message,'error');return;} $('checkpointModal').classList.remove('show');UI.toast('บันทึก RC แล้ว','success');await loadCheckpoints();await loadDashboard();
  }
  async function loadCheckpoints(){
    if(!state.eventId){$('checkpointsTable').innerHTML='<div class="empty">เลือก Event ก่อน</div>';return;}
    const [{data,error},{data:qrRows}]=await Promise.all([
      db.from('trail_checkpoints').select('*').eq('event_id',state.eventId).is('deleted_at',null).order('sort_order'),
      db.from('trail_qr_codes').select('id,checkpoint_id,qr_type,is_active,revoked_at').eq('event_id',state.eventId).is('revoked_at',null)
    ]);
    if(error){renderDbError('checkpointsTable',error);return;}state.checkpoints=data||[];const qrs=qrRows||[];
    if(!state.checkpoints.length){$('checkpointsTable').innerHTML='<div class="empty panel">ยังไม่มี RC — เพิ่ม RC จุดแรกได้เลย</div>';return;}
    $('checkpointsTable').innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>RC</th><th>คำใบ้/ระยะ</th><th>ตำแหน่ง</th><th>คะแนน</th><th>QR</th><th>จัดการ</th></tr></thead><tbody>${state.checkpoints.map(cp=>{const real=qrs.filter(q=>q.checkpoint_id===cp.id&&q.qr_type==='real').length,decoy=qrs.filter(q=>q.checkpoint_id===cp.id&&q.qr_type==='decoy').length;return `<tr><td><strong>RC ${cp.checkpoint_no} · ${UI.esc(cp.name)}</strong>${cp.is_finish?'<div class="badge badge-green">FINISH</div>':''}</td><td><div>${UI.esc(cp.clue||'-')}</div><div class="help">${UI.esc(cp.distance_text||'ไม่ระบุระยะ')}</div></td><td>${cp.latitude!=null&&cp.longitude!=null?`<span class="badge badge-green">📍 ปักแล้ว</span>${cp.gps_required?`<div class="help">ตรวจ GPS ${cp.gps_radius_meters||100} ม.</div>`:'<div class="help">ไม่ตรวจ GPS</div>'} `:'<span class="badge badge-gray">ยังไม่ปัก</span>'}</td><td>${cp.points}</td><td>จริง ${real} · หลอก ${decoy}</td><td><div class="row-actions"><button class="btn mini" data-edit-cp="${cp.id}">แก้ไข</button><button class="btn mini" data-real-qr="${cp.id}">+ QR จริง</button><button class="btn mini" data-decoy-qr="${cp.id}">+ QR หลอก</button><button class="btn btn-danger mini" data-del-cp="${cp.id}">ลบ</button></div></td></tr>`}).join('')}</tbody></table></div>`;
    document.querySelectorAll('[data-edit-cp]').forEach(b=>b.addEventListener('click',()=>openCheckpoint(state.checkpoints.find(x=>x.id===b.dataset.editCp))));
    document.querySelectorAll('[data-real-qr]').forEach(b=>b.addEventListener('click',()=>createQr(b.dataset.realQr,'real')));
    document.querySelectorAll('[data-decoy-qr]').forEach(b=>b.addEventListener('click',()=>createQr(b.dataset.decoyQr,'decoy')));
    document.querySelectorAll('[data-del-cp]').forEach(b=>b.addEventListener('click',()=>deleteCheckpoint(b.dataset.delCp)));
  }
  async function deleteCheckpoint(id){
    if(!await UI.confirmAction('ลบ RC นี้ออกจาก Event? ระบบจะ Soft Delete เพื่อรักษาประวัติ'))return;
    const {error}=await db.from('trail_checkpoints').update({deleted_at:new Date().toISOString(),is_active:false}).eq('id',id);if(error){UI.toast(error.message,'error');return;}await loadCheckpoints();
  }
  function randomToken(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
  async function sha256(text){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('')}
  async function createQr(checkpointId,type){
    const cp=state.checkpoints.find(x=>x.id===checkpointId);if(!cp)return;
    let penalty=0,message=null;
    if(type==='decoy'){const v=prompt('คะแนนหักเมื่อพบ QR หลอก (ใส่ 0 ถ้าไม่หัก)','0');if(v===null)return;penalty=Math.abs(Number(v)||0)*-1;message=prompt('ข้อความแจ้งผู้แข่งขัน','⚠️ คุณโดนหลอกแล้ว จุดนี้ไม่ใช่ RC ที่ถูกต้อง')||'คุณโดนหลอกแล้ว';}
    const raw=`TRAILRC:${randomToken()}`,hash=await sha256(raw);
    const {error}=await db.from('trail_qr_codes').insert({event_id:state.eventId,checkpoint_id:checkpointId,qr_type:type,token_hash:hash,token_value:raw,label:`RC${cp.checkpoint_no}-${type}-${Date.now()}`,decoy_message:message,penalty_points:penalty});
    if(error){UI.toast(error.message,'error');return;}
    showQrToken(cp,type,raw);await Promise.all([loadCheckpoints(),loadQrs()]);
  }
  function showQrToken(cp,type,raw){
    const old=$('qrTokenModal');if(old)old.remove();
    const wrap=document.createElement('div');wrap.id='qrTokenModal';wrap.className='modal-backdrop show';wrap.innerHTML=`<div class="modal" style="max-width:520px"><div class="modal-head"><h3>${type==='real'?'QR จริง':'QR หลอก'} · RC ${cp.checkpoint_no}</h3><button id="qrClose" class="btn btn-ghost mini">ปิด</button></div><div class="notice">เพื่อความปลอดภัย ระบบเก็บเฉพาะ Hash ของ Token กรุณาพิมพ์/บันทึก QR นี้ตอนนี้ หากหายให้สร้าง Token ใหม่</div><div id="qrCanvas" style="background:white;padding:18px;width:max-content;max-width:100%;margin:18px auto;border-radius:14px"></div><div class="help" style="word-break:break-all"><span class="code">${UI.esc(raw)}</span></div><div class="modal-actions"><button id="copyToken" class="btn">คัดลอก Token</button><button id="printToken" class="btn btn-primary">พิมพ์ QR</button></div></div>`;document.body.appendChild(wrap);
    if(window.QRCode){new QRCode($('qrCanvas'),{text:raw,width:260,height:260,correctLevel:QRCode.CorrectLevel.H});}else $('qrCanvas').textContent='QRCode library ไม่พร้อม — ใช้ Token ด้านล่าง';
    $('qrClose').addEventListener('click',()=>wrap.remove());$('copyToken').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(raw);UI.toast('คัดลอก Token แล้ว','success')}catch{prompt('คัดลอก Token นี้',raw)}});$('printToken').addEventListener('click',()=>window.print());
  }

  async function loadQrs(){
    if(!state.eventId){$('qrsTable').innerHTML='<div class="empty">เลือก Event ก่อน</div>';return;}
    const {data,error}=await db.from('trail_qr_codes').select('*,trail_checkpoints(checkpoint_no,name)').eq('event_id',state.eventId).order('created_at',{ascending:false});
    if(error){renderDbError('qrsTable',error);return;}const rows=data||[];
    if(!rows.length){$('qrsTable').innerHTML='<div class="empty panel">ยังไม่มี QR — สร้างจาก RC Manager</div>';return;}
    $('qrsTable').innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>RC</th><th>ประเภท</th><th>Label</th><th>คะแนน</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${rows.map(q=>`<tr><td>${q.trail_checkpoints?`RC ${q.trail_checkpoints.checkpoint_no} · ${UI.esc(q.trail_checkpoints.name)}`:'-'}</td><td>${q.qr_type==='real'?'<span class="badge badge-green">จริง</span>':'<span class="badge badge-red">หลอก</span>'}</td><td>${UI.esc(q.label||'-')}</td><td>${q.penalty_points||0}</td><td>${q.is_active&&!q.revoked_at?'<span class="badge badge-green">ใช้งาน</span>':'<span class="badge badge-gray">ยกเลิก</span>'}</td><td><div class="row-actions"><button class="btn mini" data-print-qr="${q.id}">เปิด/พิมพ์</button>${q.is_active&&!q.revoked_at?`<button class="btn btn-danger mini" data-revoke-qr="${q.id}">ยกเลิก</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`;
    document.querySelectorAll('[data-print-qr]').forEach(b=>b.addEventListener('click',()=>{const q=rows.find(x=>x.id===b.dataset.printQr);const cp=state.checkpoints.find(x=>x.id===q.checkpoint_id)||{checkpoint_no:q.trail_checkpoints?.checkpoint_no||'?',name:q.trail_checkpoints?.name||''};showQrToken(cp,q.qr_type,q.token_value)}));
    document.querySelectorAll('[data-revoke-qr]').forEach(b=>b.addEventListener('click',()=>revokeQr(b.dataset.revokeQr)));
  }
  async function revokeQr(id){
    if(!await UI.confirmAction('ยกเลิก QR นี้? QR ที่พิมพ์ไว้จะสแกนไม่ผ่านทันที'))return;
    const {error}=await db.from('trail_qr_codes').update({is_active:false,revoked_at:new Date().toISOString()}).eq('id',id);if(error){UI.toast(error.message,'error');return;}UI.toast('ยกเลิก QR แล้ว','success');await Promise.all([loadQrs(),loadCheckpoints()]);
  }

  async function loadTeams(){
    if(!state.eventId){$('teamsTable').innerHTML='<div class="empty">เลือก Event ก่อน</div>';return;}
    const {data,error}=await db.from('trail_teams').select('*,trail_release_slots(scheduled_at,actual_released_at,release_status)').eq('event_id',state.eventId).is('deleted_at',null).order('team_no');if(error){renderDbError('teamsTable',error);return;}state.teams=data||[];
    if(!state.teams.length){$('teamsTable').innerHTML='<div class="empty panel">ยังไม่มีทีมสมัคร</div>';return;}
    $('teamsTable').innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>ทีม</th><th>สถานะ</th><th>ชำระเงิน</th><th>คิวโดยประมาณ</th><th>ปล่อยจริง</th><th>คะแนน</th><th>จัดการ</th></tr></thead><tbody>${state.teams.map(t=>{const slot=t.trail_release_slots?.[0];const released=t.status==='racing'||slot?.release_status==='released';return `<tr><td><strong>${UI.esc(t.team_code)}</strong><div class="help">${UI.esc(t.team_name||'-')}</div></td><td>${statusBadge(t.status)}</td><td>${UI.esc(t.payment_status)}</td><td>${slot?.scheduled_at?UI.dateTimeTH(slot.scheduled_at):'-'}</td><td>${slot?.actual_released_at?UI.dateTimeTH(slot.actual_released_at):(t.started_at?UI.dateTimeTH(t.started_at):'-')}</td><td>${t.total_score}</td><td><div class="row-actions"><button class="btn mini" data-approve-team="${t.id}" ${released?'disabled':''}>${t.status==='approved'?'ยกเลิกอนุมัติ':'อนุมัติ'}</button><button class="btn ${released?'btn-ghost':'btn-primary'} mini" data-release-team="${t.id}" ${released?'disabled':''}>${released?'ปล่อยตัวแล้ว':'ปล่อยตัว'}</button></div></td></tr>`}).join('')}</tbody></table></div>`;
    document.querySelectorAll('[data-approve-team]').forEach(b=>b.addEventListener('click',()=>toggleApprove(b.dataset.approveTeam)));
    document.querySelectorAll('[data-release-team]').forEach(b=>b.addEventListener('click',()=>releaseNow(b.dataset.releaseTeam)));
  }
  async function toggleApprove(id){const t=state.teams.find(x=>x.id===id);const next=t.status==='approved'?'pending':'approved';const {error}=await db.from('trail_teams').update({status:next}).eq('id',id);if(error){UI.toast(error.message,'error');return;}await loadTeams();await loadDashboard();}
  async function generateSlots(){
    const ev=currentEvent();if(!ev){UI.toast('เลือก Event ก่อน','error');return;}if(!ev.event_date||!ev.race_start_time){UI.toast('กรุณาตั้งวันที่และเวลาเริ่มของ Event ก่อน','error');return;}
    const teams=state.teams.filter(t=>!['cancelled','disqualified','racing','finished'].includes(t.status)&&t.trail_release_slots?.[0]?.release_status!=='released');
    if(!teams.length){UI.toast('ไม่มีทีมที่ต้องสร้าง/อัปเดตคิวโดยประมาณ','success');return;}
    const base=new Date(`${ev.event_date}T${ev.race_start_time.slice(0,8)}+07:00`);
    const rows=teams.map(t=>({event_id:ev.id,team_id:t.id,scheduled_at:new Date(base.getTime()+(Math.max(1,Number(t.team_no||1))-1)*ev.release_interval_minutes*60000).toISOString(),release_status:'scheduled'}));
    const {error}=await db.from('trail_release_slots').upsert(rows,{onConflict:'event_id,team_id'});if(error){UI.toast(error.message,'error');return;}UI.toast(`อัปเดตคิวโดยประมาณ ${rows.length} ทีมแล้ว (ไม่แตะทีมที่ปล่อยตัวแล้ว)`,'success');await loadTeams();
  }
  async function releaseNow(teamId){
    const ev=currentEvent();
    const team=state.teams.find(t=>t.id===teamId);if(!team)return;
    if(!ev||ev.status!=='live'){UI.toast('กรุณาเปลี่ยน Event เป็น “กำลังแข่งขัน” ก่อนปล่อยตัว','error');return;}
    const alreadyReleased=team.status==='racing'&&!!team.started_at&&team.trail_release_slots?.[0]?.release_status==='released';
    if(alreadyReleased){UI.toast(`${team.team_code} ปล่อยตัวแล้ว`,'success');return;}
    if(team.status!=='approved'&&team.status!=='racing'){
      if(!await UI.confirmAction(`${team.team_code} ยังไม่ได้อยู่สถานะอนุมัติ ต้องการปล่อยตัวทีมนี้เลยหรือไม่?`))return;
    }else if(!await UI.confirmAction(`ปล่อยตัว ${team.team_code} ตอนนี้? ระบบจะบันทึกเวลาจริงทันที`))return;
    const {data,error}=await db.rpc('trail_release_team',{p_event_id:state.eventId,p_team_id:teamId});
    if(error){
      const msg=String(error.message||'');
      if(msg.includes('trail_release_team')) UI.toast('ฐานข้อมูลยังไม่มีฟังก์ชันปล่อยตัว กรุณารัน manual_release_atomic.sql ครั้งเดียว','error');
      else if(msg.includes('EVENT_NOT_LIVE')) UI.toast('Event ต้องอยู่สถานะ “กำลังแข่งขัน” ก่อน','error');
      else UI.toast(error.message,'error');
      return;
    }
    const released=Array.isArray(data)?data[0]:data;
    UI.toast(`${team.team_code} ปล่อยตัวแล้ว${released?.actual_released_at?' · บันทึกเวลาจริงสำเร็จ':''}`,'success');await loadTeams();await loadDashboard();
  }

  async function loadScans(){
    if(!state.eventId){$('scansTable').innerHTML='<div class="empty">เลือก Event ก่อน</div>';return;}
    const {data,error}=await db.from('trail_scan_logs').select('id,scanned_at,result,points_delta,message,team_id,checkpoint_id,trail_teams(team_code,team_name),trail_checkpoints(checkpoint_no,name)').eq('event_id',state.eventId).order('scanned_at',{ascending:false}).limit(100);if(error){renderDbError('scansTable',error);return;}
    const rows=data||[];if(!rows.length){$('scansTable').innerHTML='<div class="empty panel">ยังไม่มีการสแกน</div>';return;}
    $('scansTable').innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>เวลา</th><th>ทีม</th><th>RC</th><th>ผล</th><th>คะแนน</th><th>ข้อความ</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${UI.dateTimeTH(r.scanned_at)}</td><td>${UI.esc(r.trail_teams?.team_code||'-')}</td><td>${r.trail_checkpoints?`RC ${r.trail_checkpoints.checkpoint_no} · ${UI.esc(r.trail_checkpoints.name)}`:'-'}</td><td>${scanBadge(r.result)}</td><td>${r.points_delta>0?'+':''}${r.points_delta}</td><td>${UI.esc(r.message||'')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function scanBadge(result){const ok=result==='passed',decoy=result==='decoy';return `<span class="badge ${ok?'badge-green':decoy?'badge-red':'badge-yellow'}">${UI.esc(result)}</span>`}
  function startRealtime(){
    if(state.realtime){db.removeChannel(state.realtime);state.realtime=null;}if(!state.eventId)return;
    state.realtime=db.channel(`trail-scan-${state.eventId}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'trail_scan_logs',filter:`event_id=eq.${state.eventId}`},()=>{loadScans();loadDashboard();}).subscribe();
  }

  async function loadSettings(){
    if(!state.eventId)return;let {data,error}=await db.from('trail_event_settings').select('*').eq('event_id',state.eventId).maybeSingle();if(error){UI.toast(error.message,'error');return;}if(!data){const ins=await db.from('trail_event_settings').insert({event_id:state.eventId}).select().single();data=ins.data;if(ins.error)return;}
    $('scoreMode').value=data.score_mode||'points';$('decoyPenalty').value=data.decoy_default_penalty??0;$('requireOrder').checked=!!data.require_checkpoint_order;$('allowRescan').checked=!!data.allow_rescan;$('lineSuccess').checked=!!data.line_success_enabled;$('lineDecoy').checked=!!data.line_decoy_enabled;
  }
  async function saveSettings(e){e.preventDefault();if(!state.eventId)return;const payload={event_id:state.eventId,score_mode:$('scoreMode').value,decoy_default_penalty:Number($('decoyPenalty').value)||0,require_checkpoint_order:$('requireOrder').checked,allow_rescan:$('allowRescan').checked,line_success_enabled:$('lineSuccess').checked,line_decoy_enabled:$('lineDecoy').checked,updated_at:new Date().toISOString()};const {error}=await db.from('trail_event_settings').upsert(payload);if(error){UI.toast(error.message,'error');return;}UI.toast('บันทึก Settings แล้ว','success')}

  function renderDbError(target,error){$(target).innerHTML=`<div class="empty panel"><strong>โหลดข้อมูลไม่สำเร็จ</strong><div class="help">${UI.esc(error.message)}</div></div>`;}
  boot().catch(err=>{console.error(err);UI.toast(err.message||'เกิดข้อผิดพลาด','error')});
})();
