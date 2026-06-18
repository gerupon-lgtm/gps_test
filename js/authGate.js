// =====================================================
// authGate.js
// 認証ゲート。未ログインならオーバーレイを表示し、
// ログイン/登録が成立するまで待機する。
// =====================================================
const AuthGate = {
  player: null,

  // ログイン状態を保証する。成立すると player を返す。
  async ensureAuth() {
    try {
      this.player = await API.me();
      this._renderStatus();
      this._bindLogout();
      return this.player;
    } catch (e) {
      if (e.status === 401) {
        return await this._showOverlay();
      }
      throw e; // ネットワーク等は呼び出し側で処理
    }
  },

  _renderStatus() { /* ステータスは地図右上HUD(updateHpDisplay)に統一 */ },

  _bindLogout() {
    const btn = document.getElementById("btn-logout");
    if (!btn) return;
    btn.onclick = async () => {
      try { await API.logout(); } catch (e) {}
      location.reload();
    };
  },

  _showOverlay() {
    return new Promise((resolve) => {
      const ov = document.getElementById("auth-overlay");
      const msg = document.getElementById("auth-msg");
      const loginForm = document.getElementById("auth-login-form");
      const regForm = document.getElementById("auth-register-form");
      const tabLogin = document.getElementById("auth-tab-login");
      const tabReg = document.getElementById("auth-tab-register");
      ov.classList.remove("hidden");

      const showLogin = () => {
        loginForm.classList.remove("hidden");
        regForm.classList.add("hidden");
        tabLogin.classList.add("active");
        tabReg.classList.remove("active");
        msg.textContent = "";
      };
      const showReg = () => {
        regForm.classList.remove("hidden");
        loginForm.classList.add("hidden");
        tabReg.classList.add("active");
        tabLogin.classList.remove("active");
        msg.textContent = "";
      };
      tabLogin.onclick = showLogin;
      tabReg.onclick = showReg;

      const v = (id) => document.getElementById(id).value.trim();
      const avatarSrc = (value) => {
        const src = String(value || "assets/avatar_dog_bold_2.png").trim();
        if (/^(https?:)?\/\//.test(src) || src.startsWith("/") || src.startsWith("./")) return src;
        return "./" + src.replace(/^\/+/, "");
      };
      const syncAvatarPreview = () => {
        const select = document.getElementById("auth-reg-avatar");
        const preview = document.getElementById("auth-reg-avatar-preview");
        if (!select || !preview) return;
        preview.src = avatarSrc(select.value);
      };
      const loadAvatarOptions = async () => {
        const select = document.getElementById("auth-reg-avatar");
        if (!select) return;
        let data = null;
        try { data = await API.avatarOptions(); } catch (e) { data = null; }
        const avatars = data && Array.isArray(data.avatars) && data.avatars.length ? data.avatars : ["assets/avatar_dog_bold_2.png"];
        select.innerHTML = avatars.map((avatar) => '<option value="' + avatar + '">' + avatar.replace(/^assets\//, "") + "</option>").join("");
        select.value = data && data.defaultAvatar ? data.defaultAvatar : avatars[0];
        syncAvatarPreview();
      };
      const finish = async () => {
        this.player = await API.me();
        ov.classList.add("hidden");
        this._renderStatus();
        this._bindLogout();
        resolve(this.player);
      };
      document.getElementById("auth-reg-avatar").onchange = syncAvatarPreview;
      loadAvatarOptions();

      document.getElementById("auth-login-btn").onclick = async () => {
        msg.textContent = "ログイン中...";
        try {
          await API.login(v("auth-login-id"), v("auth-login-pw"));
          await finish();
        } catch (e) { msg.textContent = e.message; }
      };
      document.getElementById("auth-register-btn").onclick = async () => {
        msg.textContent = "登録中...";
        try {
          await API.register(v("auth-reg-id"), v("auth-reg-pw"), v("auth-reg-name"), v("auth-reg-invite"), v("auth-reg-avatar"));
          await finish();
        } catch (e) { msg.textContent = e.message; }
      };
    });
  },
};
