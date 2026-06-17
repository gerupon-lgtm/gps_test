(function (root) {
  const ADMIN_APP_VERSION = {
    version: "0.1.0",
    assetsVersion: "0.1.0",
    releasedAt: "2026-06-18",
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ADMIN_APP_VERSION };
  }
  root.ADMIN_APP_VERSION = ADMIN_APP_VERSION;
})(typeof globalThis !== "undefined" ? globalThis : window);
