// =====================================================
// map.js
// Leaflet で「自分の現在地」のみ表示する。
// タイルは window.MAP_KEY があれば MapTiler、無ければ OSM。
// MapTilerのタイル取得が失敗(上限超過/キー無効/障害)した場合は
// OSM へ自動フォールバックする。
// スポットのピンは置かない(距離は数字でのみ表示)。
// =====================================================

let _map = null;
let _selfDot = null;
let _accCircle = null;
let _mapInited = false;
let _lastLL = null;
let _userMoved = false; // ユーザーが地図を動かしたら自動追従を止める

let _tileLayer = null;       // 現在のタイルレイヤー
let _usingFallback = false;  // OSMフォールバック済みフラグ
let _tileErrorCount = 0;     // タイル取得エラー回数

function isLeafletReady() {
  return typeof L !== "undefined";
}

// MapTilerのタイルレイヤー
function maptilerLayer(key) {
  return L.tileLayer(
    "https://api.maptiler.com/maps/" + (CONFIG.MAP_STYLE || "streets-v4") +
      "/{z}/{x}/{y}.png?key=" + key,
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

// OSMのタイルレイヤー(フォールバック/キー未設定時)
function osmLayer() {
  return L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  });
}

// MapTilerのタイルエラーを監視し、一定回数失敗したらOSMへ切替
function attachFallback(layer) {
  const key = (typeof window !== "undefined" && window.MAP_KEY) ? window.MAP_KEY : "";
  if (!key) return; // すでにOSMなら不要
  layer.on("tileerror", () => {
    _tileErrorCount++;
    // 数枚連続で失敗 = 上限超過/キー無効/障害とみなしてOSMへ
    if (!_usingFallback && _tileErrorCount >= 3) {
      _usingFallback = true;
      try { _map.removeLayer(layer); } catch (e) {}
      osmLayer().addTo(_map);
      console.warn("MapTilerのタイル取得に失敗したため、OSMにフォールバックしました。");
    }
  });
}

function initMap() {
  if (_mapInited || !isLeafletReady()) return;
  _map = L.map("map", { zoomControl: true }).setView(
    [35.01476933763732, 136.66082076514405],
    CONFIG.MAP_DEFAULT_ZOOM
  );
  const key = (typeof window !== "undefined" && window.MAP_KEY) ? window.MAP_KEY : "";
  _tileLayer = key ? maptilerLayer(key) : osmLayer();
  attachFallback(_tileLayer);
  _tileLayer.addTo(_map);
  _map.on("dragstart", function () { _userMoved = true; });
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

  if (!_userMoved) {
    const z = _map.getZoom();
    _map.setView(ll, z < CONFIG.MAP_DEFAULT_ZOOM - 2 ? CONFIG.MAP_DEFAULT_ZOOM : z);
  }
}

function recenterMap() {
  if (!_map || !_lastLL) return false;
  _userMoved = false; // 「現在地」を押したら追従を再開
  _map.setView(_lastLL, CONFIG.MAP_DEFAULT_ZOOM);
  return true;
}

// 宿屋・道具屋を絵文字アイコンで表示。タップでポップアップ(休む/入店)。
let _poiLayer = null;
function _escapeHtml(x) {
  return String(x).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function _poiIcon(emoji, color) {
  return L.divIcon({
    className: "poi-icon",
    html: '<div class="poi-pin" style="border-color:' + color + '">' + emoji + "</div>",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}
function setPois(inns, shops) {
  if (!isLeafletReady()) return;
  if (!_mapInited) initMap();
  if (!_map) return;
  if (_poiLayer) { try { _map.removeLayer(_poiLayer); } catch (e) {} }
  _poiLayer = L.layerGroup();
  (inns || []).forEach(function (n) {
    if (n.latitude == null || n.longitude == null) return;
    var html = '<div class="poi-popup"><b>🛏 ' + _escapeHtml(n.inn_name) + "</b><br>" +
      "<button class=\"poi-btn\" onclick=\"onInnEnter('" + n.inn_id + "')\">休む</button>" +
      '<div class="poi-hint"></div></div>';
    var mi = L.marker([n.latitude, n.longitude], { icon: _poiIcon("🛏", "#16a34a") }).bindPopup(html);
    mi.on("popupopen", function (e) { if (typeof onPoiPopupOpen === "function") onPoiPopupOpen("inn", n.inn_id, e.popup.getElement()); });
    mi.addTo(_poiLayer);
  });
  (shops || []).forEach(function (sh) {
    if (sh.latitude == null || sh.longitude == null) return;
    var html = '<div class="poi-popup"><b>🛒 ' + _escapeHtml(sh.shop_name) + "</b><br>" +
      "<button class=\"poi-btn\" onclick=\"onShopEnter('" + sh.shop_id + "')\">入店</button>" +
      '<div class="poi-hint"></div></div>';
    var ms = L.marker([sh.latitude, sh.longitude], { icon: _poiIcon("🛒", "#2563eb") }).bindPopup(html);
    ms.on("popupopen", function (e) { if (typeof onPoiPopupOpen === "function") onPoiPopupOpen("shop", sh.shop_id, e.popup.getElement()); });
    ms.addTo(_poiLayer);
  });
  _poiLayer.addTo(_map);
}
function closePoiPopups() { if (_map) _map.closePopup(); }

// 丸囲みなしの強色アイコン(背景・枠なし。白フチで視認性確保)
function _plainIcon(glyph, color) {
  return L.divIcon({
    className: "poi-plain",
    html: '<span class="poi-plain-mark" style="color:' + color + '">' + glyph + "</span>",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -12],
  });
}

// 撃破済みスポット(丸なし・強色の旗アイコン)
let _defeatedLayer = null;
function setDefeatedSpots(spots) {
  if (!isLeafletReady()) return;
  if (!_mapInited) initMap();
  if (!_map) return;
  if (_defeatedLayer) { try { _map.removeLayer(_defeatedLayer); } catch (e) {} }
  _defeatedLayer = L.layerGroup();
  (spots || []).forEach(function (sp) {
    if (sp.latitude == null || sp.longitude == null) return;
    L.marker([sp.latitude, sp.longitude], { icon: _plainIcon("⚑", "#dc2626") })
      .bindPopup("⚑ " + _escapeHtml(sp.spot_name) + "(撃破済み)").addTo(_defeatedLayer);
  });
  _defeatedLayer.addTo(_map);
}
