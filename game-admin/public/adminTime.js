(function (root) {
  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function toDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatLocalDateTime(value, fallback) {
    const date = toDate(value);
    if (!date) return fallback == null ? "-" : fallback;
    return [
      date.getFullYear(),
      "-",
      pad(date.getMonth() + 1),
      "-",
      pad(date.getDate()),
      " ",
      pad(date.getHours()),
      ":",
      pad(date.getMinutes()),
    ].join("");
  }

  const api = { formatLocalDateTime };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.adminTime = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
