const test = require("node:test");
const assert = require("node:assert/strict");

test("formats ISO timestamps in the logged-in user's local time zone", () => {
  const previousTz = process.env.TZ;
  process.env.TZ = "Asia/Tokyo";
  delete require.cache[require.resolve("../public/adminTime")];
  const { formatLocalDateTime } = require("../public/adminTime");

  try {
    assert.equal(formatLocalDateTime("2026-06-17T15:00:00.000Z"), "2026-06-18 00:00");
  } finally {
    if (previousTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTz;
    }
  }
});

test("returns the fallback for empty timestamps", () => {
  const { formatLocalDateTime } = require("../public/adminTime");

  assert.equal(formatLocalDateTime(null, "なし"), "なし");
});
