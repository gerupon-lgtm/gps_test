// =====================================================
// map.js
// Leaflet + OpenStreetMap で「自分の現在地」のみ表示する。
// スポットのピンは置かない(距離は数字でのみ表示)。
// Leaflet(L)が読み込めない場合は地図機能を無効化する。
// =====================================================

let _map = null;
let _selfDot = null; // 現在地マーカー(円)
let _accCircle = null; // 精度の円
let _mapInited = false;

function isLeafletReady() {
  return typeof L !== "undefined";
}

// 地図を初期化(探索画面表示後・地図要素が見えてから呼ぶ)
function initMap() {
  if (_mapInited || !isLeafletReady()) return;
  _map = L.map("map", { zoomControl: true }).setView([35.681236, 139.767125], 16);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(_map);
  _mapInited = true;
}

// 表示直後にサイズを再計算(非表示中に初期化すると崩れるため)
function refreshMapSize() {
  if (_map) {
    setTimeout(() => _map.invalidateSize(), 80);
  }
}

// 現在地を地図に反映する
function updateMapPosition(lat, lng, accuracy) {
  if (!isLeafletReady()) return;
  if (!_mapInited) initMap();
  if (!_map) return;

  const ll = [lat, lng];

  // 現在地の点
  if (!_selfDot) {
    _selfDot = L.circleMarker(ll, {
      radius: 8,
      color: "#ffffff",
      weight: 2,
      fillColor: "#4f8cff",
      fillOpacity: 1,
    })
      .addTo(_map)
      .bindPopup("現在地");
  } else {
    _selfDot.setLatLng(ll);
  }

  // 精度の円
  if (accuracy != null && !Number.isNaN(accuracy)) {
    if (!_accCircle) {
      _accCircle = L.circle(ll, {
        radius: accuracy,
        color: "#4f8cff",
        weight: 1,
        fillColor: "#4f8cff",
        fillOpacity: 0.1,
      }).addTo(_map);
    } else {
      _accCircle.setLatLng(ll);
      _accCircle.setRadius(accuracy);
    }
  }

  _map.setView(ll, _map.getZoom() < 14 ? 16 : _map.getZoom());
}
