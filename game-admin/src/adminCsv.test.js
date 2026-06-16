const test = require("node:test");
const assert = require("node:assert/strict");

const {
  diffMasterRows,
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
