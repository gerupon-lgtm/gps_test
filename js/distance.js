// =====================================================
// distance.js
// 緯度経度間の距離計算(Haversine式)とスポット探索
// =====================================================

// 2点間の地表距離をメートルで返す
function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // 地球半径(m)
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 現在地に最も近い有効スポットを返す。{ spot, distance } または null
function findNearestSpot(currentPosition, spots) {
  let nearest = null;
  for (const spot of spots) {
    if (!spot.active) continue;
    const distance = calculateDistanceMeters(
      currentPosition.latitude,
      currentPosition.longitude,
      spot.latitude,
      spot.longitude
    );
    if (nearest === null || distance < nearest.distance) {
      nearest = { spot, distance };
    }
  }
  return nearest;
}

// 範囲内(距離 <= radius_meters)に入っている最寄りスポットを返す。
// accuracy が許容値を超える場合は判定しない(null)。
function findEnterableSpot(currentPosition, spots, accuracy) {
  if (accuracy != null && accuracy > CONFIG.GPS_ACCURACY_LIMIT_METERS) {
    return null; // 精度不足
  }
  let best = null;
  for (const spot of spots) {
    if (!spot.active) continue;
    const distance = calculateDistanceMeters(
      currentPosition.latitude,
      currentPosition.longitude,
      spot.latitude,
      spot.longitude
    );
    if (distance <= spot.radius_meters) {
      if (best === null || distance < best.distance) {
        best = { spot, distance };
      }
    }
  }
  return best;
}

// 2点間の方位角(度, 0=北, 時計回り)を返す
function calculateBearing(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// 方位角を8方位の日本語(矢印付き)に変換
function bearingToCompass(deg) {
  const dirs = [
    "北 ↑", "北東 ↗", "東 →", "南東 ↘",
    "南 ↓", "南西 ↙", "西 ←", "北西 ↖",
  ];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}
