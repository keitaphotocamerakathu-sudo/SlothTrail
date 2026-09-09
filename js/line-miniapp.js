window.TrailMiniApp = (() => {
  let initPromise = null;
  let cached = null;
  function cfg() { return window.TRAIL_CONFIG || {}; }
  async function init(options = {}) {
    if (cached) return cached;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const liffId = cfg().LINE_MINI_APP_LIFF_ID;
      if (!liffId) throw new Error('ยังไม่ได้ตั้ง LINE_MINI_APP_LIFF_ID ใน js/config.js');
      if (!window.liff) throw new Error('โหลด LINE LIFF SDK ไม่สำเร็จ');
      await liff.init({ liffId });
      if (!liff.isLoggedIn()) {
        if (options.login === false) throw new Error('กรุณาเข้าสู่ระบบ LINE');
        liff.login({ redirectUri: location.href });
        return new Promise(() => {});
      }
      const idToken = liff.getIDToken();
      if (!idToken) throw new Error('LINE MINI App ไม่ได้คืน ID token กรุณาเปิด scope openid');
      let profile = null;
      try { profile = await liff.getProfile(); } catch (_) {}
      cached = { liff, profile, inClient: liff.isInClient() };
      return cached;
    })();
    return initPromise;
  }
  function errorText(value, fallback = 'เรียกใช้งานระบบไม่สำเร็จ') {
    if (value == null) return fallback;
    if (typeof value === 'string') return value || fallback;
    if (value instanceof Error) return value.message || fallback;
    if (typeof value === 'object') {
      const parts = [value.message, value.error_description, value.error, value.details, value.hint, value.code]
        .filter(v => typeof v === 'string' && v.trim());
      if (parts.length) return [...new Set(parts)].join(' | ');
      try { return JSON.stringify(value); } catch (_) { return fallback; }
    }
    return String(value);
  }
  async function call(functionName, body = {}) {
    const session = await init();
    const idToken = session.liff.getIDToken();
    if (!idToken) throw new Error('ไม่พบ LINE ID token กรุณาปิดแล้วเปิด MINI App ใหม่');
    const { data, error } = await trailDb.functions.invoke(functionName, { body: { ...body, id_token: idToken } });
    if (error) {
      let message = errorText(error);
      try { const responseBody = await error.context?.json(); message = errorText(responseBody, message); } catch (_) {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(errorText(data));
    return data;
  }
  function decoded() { try { return window.liff?.getDecodedIDToken?.() || null; } catch (_) { return null; } }
  return { init, call, decoded };
})();
