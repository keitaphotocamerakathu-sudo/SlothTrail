window.TrailMiniApp = (() => {
  let initPromise = null;
  let cached = null;

  function cfg() {
    return window.TRAIL_CONFIG || {};
  }

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

      cached = {
        liff,
        profile,
        inClient: liff.isInClient()
      };
      return cached;
    })();
    return initPromise;
  }

  async function call(functionName, body = {}) {
    const session = await init();
    const idToken = session.liff.getIDToken();
    if (!idToken) throw new Error('ไม่พบ LINE ID token กรุณาปิดแล้วเปิด MINI App ใหม่');
    const { data, error } = await trailDb.functions.invoke(functionName, {
      body: { ...body, id_token: idToken }
    });
    if (error) {
      let message = error.message || 'เรียกใช้งานระบบไม่สำเร็จ';
      try {
        const responseBody = await error.context?.json();
        message = responseBody?.message || responseBody?.error || message;
      } catch (_) {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.message || data.error);
    return data;
  }

  function decoded() {
    try { return window.liff?.getDecodedIDToken?.() || null; } catch (_) { return null; }
  }

  return { init, call, decoded };
})();
