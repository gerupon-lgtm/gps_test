// =====================================================
// geo.js
// Geolocation API による位置情報取得
// =====================================================

let _watchId = null;

// テスト用のモック位置(null のとき実GPSを使う)
let _mockPosition = null; // { latitude, longitude, accuracy }
let _mockOnSuccess = null;

// モック位置をセット/解除(テスト機能から呼ぶ)
function setMockPosition(latitude, longitude, accuracy) {
  _mockPosition = { latitude, longitude, accuracy };
  // 実GPSの監視が動いていたら止める(直後の実GPS更新でモックが上書きされるのを防ぐ)
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
  if (_mockOnSuccess) {
    _mockOnSuccess({
      latitude: _mockPosition.latitude,
      longitude: _mockPosition.longitude,
      accuracy: _mockPosition.accuracy,
      timestamp: Date.now(),
      mock: true,
    });
  }
}

function clearMockPosition() {
  _mockPosition = null;
}

function isMockActive() {
  return _mockPosition !== null;
}

// 位置監視を開始する。
// onSuccess({latitude, longitude, accuracy, timestamp, mock})
// onError({code, message})
function startWatchPosition(onSuccess, onError) {
  _mockOnSuccess = onSuccess;

  // モックが有効ならモック位置を即時通知して終了
  if (_mockPosition) {
    onSuccess({
      latitude: _mockPosition.latitude,
      longitude: _mockPosition.longitude,
      accuracy: _mockPosition.accuracy,
      timestamp: Date.now(),
      mock: true,
    });
    return;
  }

  if (!("geolocation" in navigator)) {
    onError({ code: -1, message: "この端末/ブラウザは位置情報に対応していません" });
    return;
  }

  _watchId = navigator.geolocation.watchPosition(
    (pos) => {
      onSuccess({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
        mock: false,
      });
    },
    (err) => {
      let message = "現在地を取得できませんでした";
      if (err.code === 1) message = "位置情報が許可されていません";
      else if (err.code === 2) message = "現在地を取得できませんでした";
      else if (err.code === 3) message = "位置情報の取得がタイムアウトしました";
      onError({ code: err.code, message });
    },
    CONFIG.GEO_OPTIONS
  );
}

function stopWatchPosition() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
}
