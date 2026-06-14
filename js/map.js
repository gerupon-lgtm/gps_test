// =====================================================
// map.js
// Leaflet で「自分の現在地」のみ表示する。
// タイルは window.MAP_KEY があれば MapTiler、無ければ OSM にフォールバック。
// (MAP_KEY は js/map-key.js で定義。Gitには含めない=ビルド時/手元で注入)
// スポットのピンは置かない(距離は数字でのみ表示)。
// =====================================================

let _map = null;
let _selfDot = null;
let _accCircle = null;
let _mapInited = false;
let _lastLL = null;

function isLeafletReady() {
  return typeof L !== "undefined";
}

// 使用するタイルレイヤーを返す(MapTiler優先・OSMフォールバック)
function buildTileLayer() {
  const key = (typeof window !== "undefined" && window.MAP_KEY) ? window.MAP_KEY : "";
  if (key) {
    // MapTiler ラスタタイル(512px) → Leaflet用に tileSize/zoomOffset を調整
    return L.tileLayer(
      "https://api.maptiler.com/maps/" + (CONFIG.MAP_STYLE || "streets-v2") + "/{z}/{x}/{y}.png?key=" + key,
      {
        tileSize: 512,
        zoomOffset: -1,
        minZoom: 1,
        maxZoom: 20,
        attribution:
          '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' +
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        crossOrigin: true,
      }
    );
  }
  // フォールバック: OSM公開タイル(開発・キー未設定時のみ)
  return L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  });
}

function initMap() {
  if (_mapInited || !isLeafletReady()) return;
  _map = L.map("map", { zoomControl: true }).setView(
    [35.01476933763732, 136.66082076514405],
    CONFIG.MAP_DEFAULT_ZOOM
  );
  buildTileLayer().addTo(_map);
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

  const z = _map.getZoom();
  _map.setView(ll, z < CONFIG.MAP_DEFAULT_ZOOM - 2 ? CONFIG.MAP_DEFAULT_ZOOM : z);
}

function recenterMap() {
  if (!_map || !_lastLL) return false;
  _map.setView(_lastLL, CONFIG.MAP_DEFAULT_ZOOM);
  return true;
}
