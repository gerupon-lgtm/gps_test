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
let _lastLL = null; // 直近の現在地 [lat, lng]

function isLeafletReady() {
  return typeof L !== "undefined";
}

function initMap() {
  if (_mapInited || !isLeafletReady()) return;
  _map = L.map("map", { zoomControl: true }).setView(
    [35.01476933763732, 136.66082076514405],
    CONFIG.MAP_DEFAULT_ZOOM
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(_map);
  _mapInited = true;
}

function refreshMapSize() {
  if (_map) {
    setTimeout(() => _map.invalidateSize(), 80);
  }
}

function updateMapPosition(lat, lng, accuracy) {
  if (!isLeafletReady()) return;
  if (!_mapInited) initMap();
  if (!_map) return;

  const ll = [lat, lng];
  _lastLL = ll;

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

  // 既定より引いている場合のみ既定ズームへ寄せる。ユーザーの拡大操作は尊重。
  const z = _map.getZoom();
  _map.setView(ll, z < CONFIG.MAP_DEFAULT_ZOOM - 2 ? CONFIG.MAP_DEFAULT_ZOOM : z);
}

// 「現在地に戻る」: 地図の中心を現在地へ戻し、既定ズームにする
function recenterMap() {
  if (!_map || !_lastLL) return false;
  _map.setView(_lastLL, CONFIG.MAP_DEFAULT_ZOOM);
  return true;
}
