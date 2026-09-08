(function () {
  const cfg = window.TRAIL_CONFIG || {};
  if (!window.supabase) throw new Error('Supabase JS not loaded');
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY || cfg.SUPABASE_URL.includes('YOUR_PROJECT')) {
    console.warn('Trail RC: กรุณาตั้งค่า js/config.js ก่อนเชื่อม Supabase');
  }
  window.trailDb = window.supabase.createClient(
    cfg.SUPABASE_URL || 'https://example.supabase.co',
    cfg.SUPABASE_PUBLISHABLE_KEY || 'demo',
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
  );
})();
