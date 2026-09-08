window.TrailUI = (() => {
  const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const dateTH = (v) => {
    if (!v) return '-';
    const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
    if (Number.isNaN(d.getTime())) return v;
    return new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{day:'2-digit',month:'short',year:'numeric'}).format(d);
  };
  const dateTimeTH = (v) => {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    return new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(d);
  };
  const toast = (message, type='info') => {
    let el = document.getElementById('appToast');
    if (!el) { el = document.createElement('div'); el.id='appToast'; el.className='toast'; document.body.appendChild(el); }
    el.textContent = message;
    el.style.borderColor = type === 'error' ? '#8a3543' : type === 'success' ? '#245c40' : '#263550';
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(()=>el.classList.remove('show'), 3200);
  };
  const confirmAction = async (message) => window.confirm(message);
  const qs = (name) => new URLSearchParams(location.search).get(name);
  const slugify = (text='') => String(text).trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70);
  return { esc, dateTH, dateTimeTH, toast, confirmAction, qs, slugify };
})();
