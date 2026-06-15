// =====================================================
// api.js
// サーバーAPI(同一オリジン)へのfetchラッパー。Cookie認証。
// =====================================================
const API_BASE = (typeof CONFIG !== "undefined" && CONFIG.API_BASE) || "";

async function _api(path, method, body) {
  const opt = { method, credentials: "include", headers: {} };
  if (body !== undefined) {
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(body);
  }
  const res = await fetch(API_BASE + path, opt);
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error) || ("HTTP " + res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const API = {
  me: () => _api("/api/me", "GET"),
  register: (loginId, password, name, inviteCode) =>
    _api("/api/auth/register", "POST", { loginId, password, name, inviteCode }),
  login: (loginId, password) => _api("/api/auth/login", "POST", { loginId, password }),
  logout: () => _api("/api/auth/logout", "POST"),
  postLocation: (lat, lng) => _api("/api/location", "POST", { lat, lng }),
  setShare: (share) => _api("/api/location/share", "POST", { share }),
};

// 位置報告(throttle付き)。プレイ中の位置更新ごとに呼ばれても一定間隔でのみ送信。
let _lastLocReport = 0;
function reportLocationThrottled(pos) {
  if (typeof API === "undefined" || !pos) return;
  const now = Date.now();
  const interval = (typeof CONFIG !== "undefined" && CONFIG.LOCATION_REPORT_INTERVAL_MS) || 30000;
  if (now - _lastLocReport < interval) return;
  _lastLocReport = now;
  API.postLocation(pos.latitude, pos.longitude).catch(() => {});
}
