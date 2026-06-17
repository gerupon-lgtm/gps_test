const DUPLICATE_DEFAULT_SKIP_TYPES = new Set(["enemies", "items", "postalAreas"]);
const FACILITY_MASTER_TYPES = new Set(["spots", "inns", "shops"]);

function normalizeMasterValue(type, value) {
  if (type === "boolean") {
    if (value === true || value === 1) return true;
    const s = value == null ? "" : String(value).trim().toLowerCase();
    return s === "true" || s === "1";
  }
  if (type === "int") {
    const n = Number(value);
    if (!Number.isInteger(n)) throw new Error("INVALID_NUMBER");
    return n;
  }
  if (type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error("INVALID_NUMBER");
    return n;
  }
  if (type === "nullableString") {
    const s = value == null ? "" : String(value).trim();
    return s === "" ? null : s;
  }
  return value == null ? "" : String(value);
}

function buildMasterData(config, body, allowId) {
  const data = {};
  for (const [field, type] of Object.entries(config.fields)) {
    if (!allowId && field === config.idField) continue;
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    data[field] = normalizeMasterValue(type, body[field]);
  }
  return data;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows, headers) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")),
  ].join("\n") + "\n";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const src = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      if (row.some((v) => String(v).trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((v) => String(v).trim() !== "")) rows.push(row);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((cols) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] == null ? "" : String(cols[i]).trim(); });
    return obj;
  });
}

function rowsToCsvObjects(rows, config) {
  const headers = Object.keys(config.fields);
  return {
    headers,
    rows: rows.map((row) => {
      const out = {};
      headers.forEach((h) => { out[h] = row[h]; });
      return out;
    }),
  };
}

function makeIdGenerator(config, existingRows) {
  const prefix = config.idPrefix;
  if (!prefix) return null;
  const pattern = new RegExp("^" + escapeRegExp(prefix) + "_(\\d+)$");
  let max = 0;
  for (const row of existingRows) {
    const id = String(row[config.idField] || "");
    const m = id.match(pattern);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return () => {
    max += 1;
    return prefix + "_" + String(max).padStart(5, "0");
  };
}

function diffMasterRows(config, rows, existingRows) {
  const existingMap = new Map(existingRows.map((row) => [String(row[config.idField]), row]));
  const seen = new Set();
  const changes = [];
  const errors = [];
  const nextId = makeIdGenerator(config, existingRows);
  for (let i = 0; i < rows.length; i++) {
    const raw = { ...rows[i] };
    const rowNo = i + 2;
    let id = String(raw[config.idField] || "").trim();
    if (!id && nextId) {
      id = nextId();
      raw[config.idField] = id;
    }
    if (!id) {
      errors.push({ row: rowNo, error: "IDが空です" });
      continue;
    }
    if (seen.has(id)) {
      errors.push({ row: rowNo, id, error: "IDが重複しています" });
      continue;
    }
    seen.add(id);
    for (const [field, value] of Object.entries(config.defaults || {})) {
      if (!Object.prototype.hasOwnProperty.call(raw, field)) raw[field] = value;
    }
    let data;
    try {
      data = buildMasterData(config, raw, true);
    } catch (e) {
      errors.push({ row: rowNo, id, error: "数値項目が不正です" });
      continue;
    }
    const before = existingMap.get(id) || null;
    const type = before ? "update" : "insert";
    if (!before) {
      const missing = Object.entries(config.fields)
        .filter(([field, fieldType]) =>
          fieldType !== "nullableString" &&
          !Object.prototype.hasOwnProperty.call(config.defaults || {}, field) &&
          !Object.prototype.hasOwnProperty.call(data, field)
        )
        .map(([field]) => field);
      if (missing.length > 0) {
        errors.push({ row: rowNo, id, error: "新規追加に必要な列が不足しています: " + missing.join(", ") });
        continue;
      }
    }
    const changedFields = [];
    if (before) {
      const fieldsToCompare = Object.keys(data).filter((field) => field !== config.idField);
      for (const field of fieldsToCompare) {
        const a = before[field] == null ? null : before[field];
        const b = data[field] == null ? null : data[field];
        if (String(a) !== String(b)) changedFields.push(field);
      }
    } else {
      changedFields.push(...Object.keys(config.fields));
    }
    changes.push({ row: rowNo, id, type, changedFields, data });
  }
  const missingIds = Array.from(existingMap.keys()).filter((id) => !seen.has(id));
  return { changes, errors, missingIds };
}

function prepareMasterInsert(config, raw, existingRows) {
  const preview = diffMasterRows(config, [raw], existingRows);
  const change = preview.changes[0] || null;
  if (change && change.type !== "insert") {
    return {
      change: null,
      errors: [{ id: change.id, error: "同じIDのレコードが既に存在します" }],
    };
  }
  return {
    change,
    errors: preview.errors,
  };
}

function isImportSelectedByDefault(masterType, change) {
  return !(change && change.type === "update" && DUPLICATE_DEFAULT_SKIP_TYPES.has(masterType));
}

function attachImportWarnings(masterType, changes, warnings) {
  const warningsById = new Map();
  if (FACILITY_MASTER_TYPES.has(masterType)) {
    for (const warning of warnings || []) {
      for (const side of [warning.a, warning.b]) {
        if (!side || !side.id) continue;
        if (!warningsById.has(String(side.id))) warningsById.set(String(side.id), []);
        warningsById.get(String(side.id)).push(warning);
      }
    }
  }
  return changes.map((change) => {
    const rowWarnings = warningsById.get(String(change.id)) || [];
    return {
      ...change,
      warnings: rowWarnings,
      import: rowWarnings.length > 0 ? false : isImportSelectedByDefault(masterType, change),
    };
  });
}

function prepareSelectedImportChanges(config, previewChanges, selectedChanges) {
  if (!Array.isArray(selectedChanges)) {
    return { changes: previewChanges, errors: [] };
  }
  const selectedMap = new Map(selectedChanges.map((change) => [String(change.id || ""), change]));
  const changes = [];
  const errors = [];
  for (const previewChange of previewChanges) {
    const selected = selectedMap.get(String(previewChange.id));
    if (!selected || selected.import === false) continue;
    const mergedData = {
      ...previewChange.data,
      ...(selected.data || {}),
      [config.idField]: previewChange.id,
    };
    let data;
    try {
      data = buildMasterData(config, mergedData, true);
    } catch (e) {
      errors.push({ id: previewChange.id, error: "数値項目が不正です" });
      continue;
    }
    changes.push({
      ...previewChange,
      changedFields: Object.keys(data).filter((field) => field !== config.idField),
      data,
    });
  }
  return { changes, errors };
}

function findProximityWarnings({ thresholdM, existingFacilities, importedFacilities }) {
  const warnings = [];
  const all = [...existingFacilities, ...importedFacilities].filter(hasCoordinates);
  const importedKeys = new Set(importedFacilities.map(facilityKey));
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (facilityKey(a) === facilityKey(b)) continue;
      if (!importedKeys.has(facilityKey(a)) && !importedKeys.has(facilityKey(b))) continue;
      const distanceM = distanceMeters(a.lat, a.lng, b.lat, b.lng);
      if (distanceM <= thresholdM) warnings.push({ a, b, distanceM: Math.round(distanceM * 10) / 10 });
    }
  }
  return warnings;
}

function findExistingProximityWarnings({ thresholdM, facilities }) {
  const warnings = [];
  const all = facilities.filter(hasCoordinates);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (facilityKey(a) === facilityKey(b)) continue;
      const distanceM = distanceMeters(a.lat, a.lng, b.lat, b.lng);
      if (distanceM <= thresholdM) warnings.push({ a, b, distanceM: Math.round(distanceM * 10) / 10 });
    }
  }
  return warnings;
}

function hasCoordinates(row) {
  return Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng));
}

function facilityKey(row) {
  return row.type + ":" + row.id;
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const r = 6371000;
  const dLat = (Number(lat2) - Number(lat1)) * rad;
  const dLng = (Number(lng2) - Number(lng1)) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(Number(lat1) * rad) * Math.cos(Number(lat2) * rad) *
    Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  attachImportWarnings,
  buildMasterData,
  diffMasterRows,
  findExistingProximityWarnings,
  findProximityWarnings,
  isImportSelectedByDefault,
  parseCsv,
  prepareMasterInsert,
  prepareSelectedImportChanges,
  rowsToCsvObjects,
  toCsv,
};
