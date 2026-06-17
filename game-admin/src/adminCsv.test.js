const test = require("node:test");
const assert = require("node:assert/strict");

const {
  attachImportWarnings,
  diffMasterRows,
  isImportSelectedByDefault,
  prepareSelectedImportChanges,
  findExistingProximityWarnings,
  findProximityWarnings,
  prepareMasterInsert,
} = require("./adminCsv");

const spotConfig = {
  idField: "spotId",
  defaults: { active: true },
  idPrefix: "spot",
  fields: {
    spotId: "string",
    name: "string",
    lat: "number",
    lng: "number",
    radiusM: "int",
    enemyId: "string",
    rewardItemId: "string",
    penaltyMin: "int",
    active: "boolean",
  },
};

const simpleActiveConfig = {
  idField: "id",
  defaults: { active: true },
  fields: {
    id: "string",
    name: "string",
    active: "boolean",
  },
};

test("assigns the next prefixed id when a new CSV row has an empty id", () => {
  const preview = diffMasterRows(spotConfig, [
    { spotId: "", name: "Test Spot", lat: "35", lng: "136", radiusM: "50", enemyId: "slime", rewardItemId: "potion", penaltyMin: "30" },
  ], [
    { spotId: "spot_00009", name: "Existing", lat: 35, lng: 136, radiusM: 50, enemyId: "slime", rewardItemId: "potion", penaltyMin: 30, active: true },
  ]);

  assert.equal(preview.errors.length, 0);
  assert.equal(preview.changes[0].id, "spot_00010");
  assert.equal(preview.changes[0].data.spotId, "spot_00010");
  assert.equal(preview.changes[0].type, "insert");
});

test("rejects empty ids for master types without auto id prefix", () => {
  const config = { ...spotConfig, idPrefix: undefined };
  const preview = diffMasterRows(config, [
    { spotId: "", name: "Test Spot", lat: "35", lng: "136", radiusM: "50", enemyId: "slime", rewardItemId: "potion", penaltyMin: "30" },
  ], []);

  assert.equal(preview.errors.length, 1);
  assert.match(preview.errors[0].error, /ID/);
});

test("reports proximity warnings across existing and imported facilities", () => {
  const warnings = findProximityWarnings({
    thresholdM: 10,
    existingFacilities: [
      { type: "shops", id: "shop_00001", name: "Shop", lat: 35.00000, lng: 136.00000 },
    ],
    importedFacilities: [
      { type: "spots", id: "spot_00010", name: "Spot", lat: 35.00005, lng: 136.00000 },
    ],
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].a.id, "shop_00001");
  assert.equal(warnings[0].b.id, "spot_00010");
  assert.ok(warnings[0].distanceM <= 10);
});

test("does not report a proximity warning against the same facility id", () => {
  const warnings = findProximityWarnings({
    thresholdM: 10,
    existingFacilities: [
      { type: "spots", id: "spot_00001", name: "Old", lat: 35.00000, lng: 136.00000 },
    ],
    importedFacilities: [
      { type: "spots", id: "spot_00001", name: "Updated", lat: 35.00000, lng: 136.00000 },
    ],
  });

  assert.equal(warnings.length, 0);
});

test("reports proximity warnings between already registered facilities", () => {
  const warnings = findExistingProximityWarnings({
    thresholdM: 10,
    facilities: [
      { type: "spots", id: "spot_00001", name: "Spot", lat: 35.00000, lng: 136.00000 },
      { type: "inns", id: "inn_00001", name: "Inn", lat: 35.00005, lng: 136.00000 },
      { type: "shops", id: "shop_00001", name: "Far Shop", lat: 35.01000, lng: 136.01000 },
    ],
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].a.id, "spot_00001");
  assert.equal(warnings[0].b.id, "inn_00001");
});

test("prepares a direct insert with an auto generated id", () => {
  const result = prepareMasterInsert(spotConfig, {
    spotId: "",
    name: "Direct Spot",
    lat: "35",
    lng: "136",
    radiusM: "50",
    enemyId: "slime",
    rewardItemId: "potion",
    penaltyMin: "30",
  }, [
    { spotId: "spot_00010", name: "Existing", lat: 35, lng: 136, radiusM: 50, enemyId: "slime", rewardItemId: "potion", penaltyMin: 30, active: true },
  ]);

  assert.deepEqual(result.errors, []);
  assert.equal(result.change.id, "spot_00011");
  assert.equal(result.change.data.active, true);
});

test("keeps active true when CSV omits active for a new master row", () => {
  const preview = diffMasterRows(spotConfig, [
    { spotId: "", name: "No Active", lat: "35", lng: "136", radiusM: "50", enemyId: "slime", rewardItemId: "potion", penaltyMin: "30" },
  ], []);

  assert.equal(preview.errors.length, 0);
  assert.equal(preview.changes[0].data.active, true);
});

test("preserves explicit active true and false values from imported rows", () => {
  const preview = diffMasterRows(simpleActiveConfig, [
    { id: "row_true", name: "Explicit True", active: "true" },
    { id: "row_false", name: "Explicit False", active: "false" },
  ], []);

  assert.equal(preview.errors.length, 0);
  assert.equal(preview.changes[0].data.active, true);
  assert.equal(preview.changes[1].data.active, false);
});

test("treats omitted active as true for an updated master row", () => {
  const preview = diffMasterRows(spotConfig, [
    { spotId: "spot_00001", name: "Updated", lat: "35", lng: "136", radiusM: "50", enemyId: "slime", rewardItemId: "potion", penaltyMin: "30" },
  ], [
    { spotId: "spot_00001", name: "Old", lat: 35, lng: 136, radiusM: 50, enemyId: "slime", rewardItemId: "potion", penaltyMin: 30, active: false },
  ]);

  assert.equal(preview.errors.length, 0);
  assert.equal(preview.changes[0].data.active, true);
  assert.ok(preview.changes[0].changedFields.includes("active"));
});

test("prepares only selected import changes and applies edited field values", () => {
  const preview = diffMasterRows(spotConfig, [
    { spotId: "spot_00001", name: "Skipped", lat: "35", lng: "136", radiusM: "50", enemyId: "slime", rewardItemId: "potion", penaltyMin: "30", active: "true" },
    { spotId: "spot_00002", name: "Edited", lat: "35", lng: "136", radiusM: "50", enemyId: "slime", rewardItemId: "potion", penaltyMin: "30", active: "true" },
  ], []);

  const selected = prepareSelectedImportChanges(spotConfig, preview.changes, [
    { id: "spot_00001", import: false, data: { name: "Skipped" } },
    { id: "spot_00002", import: true, data: { name: "Edited On Screen", radiusM: "80", active: false } },
  ]);

  assert.equal(selected.errors.length, 0);
  assert.equal(selected.changes.length, 1);
  assert.equal(selected.changes[0].id, "spot_00002");
  assert.equal(selected.changes[0].data.name, "Edited On Screen");
  assert.equal(selected.changes[0].data.radiusM, 80);
  assert.equal(selected.changes[0].data.active, false);
});

test("defaults duplicate enemy item and postal area imports to unchecked", () => {
  const duplicateChange = { type: "update" };
  const insertChange = { type: "insert" };

  assert.equal(isImportSelectedByDefault("enemies", duplicateChange), false);
  assert.equal(isImportSelectedByDefault("items", duplicateChange), false);
  assert.equal(isImportSelectedByDefault("postalAreas", duplicateChange), false);
  assert.equal(isImportSelectedByDefault("spots", duplicateChange), true);
  assert.equal(isImportSelectedByDefault("enemies", insertChange), true);
});

test("marks proximity warning rows as unchecked by default", () => {
  const changes = [
    { id: "spot_00001", type: "insert", data: { spotId: "spot_00001" } },
    { id: "spot_00002", type: "insert", data: { spotId: "spot_00002", active: true } },
  ];
  const warnings = [
    {
      type: "proximity",
      message: "Near existing spot",
      a: { type: "spots", id: "spot_existing" },
      b: { type: "spots", id: "spot_00002" },
    },
  ];

  const rows = attachImportWarnings("spots", changes, warnings);

  assert.equal(rows[0].import, true);
  assert.deepEqual(rows[0].warnings, []);
  assert.equal(rows[1].import, false);
  assert.equal(rows[1].data.active, true);
  assert.equal(rows[1].warnings[0].message, "Near existing spot");
});

test("does not use proximity warnings to uncheck non-facility master rows", () => {
  const changes = [{ id: "enemy_00001", type: "insert", data: { enemyId: "enemy_00001" } }];
  const warnings = [{ type: "proximity", message: "Near", a: { type: "spots", id: "spot_00001" }, b: { type: "spots", id: "spot_00002" } }];

  const rows = attachImportWarnings("enemies", changes, warnings);

  assert.equal(rows[0].import, true);
  assert.deepEqual(rows[0].warnings, []);
});
