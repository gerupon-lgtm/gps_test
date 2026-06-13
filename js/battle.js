// =====================================================
// battle.js
// 簡易ターン制戦闘
// =====================================================

// 戦闘状態を生成する
function createBattleState(enemy) {
  return {
    enemy: enemy,
    enemyHp: enemy.hp,
    playerHp: CONFIG.PLAYER_HP,
    playerMaxHp: CONFIG.PLAYER_HP,
    log: [],
    finished: false,
    result: null, // 'win' | 'lose'
  };
}

// ダメージ計算: max(1, 攻撃力 - 相手防御力)。乱数オプションあり。
function computeDamage(attack, defense) {
  let base = Math.max(1, attack - defense);
  if (CONFIG.BATTLE_USE_RANDOM) {
    const r = 1 + (Math.random() * 2 - 1) * CONFIG.BATTLE_RANDOM_RANGE;
    base = Math.max(1, Math.round(base * r));
  }
  return base;
}

// プレイヤーが敵を攻撃する
function attackEnemy(state) {
  if (state.finished) return state;
  const dmg = computeDamage(CONFIG.PLAYER_ATTACK, state.enemy.defense);
  state.enemyHp = Math.max(0, state.enemyHp - dmg);
  state.log.push("プレイヤーの攻撃! " + state.enemy.enemy_name + "に" + dmg + "ダメージ");
  return state;
}

// 敵がプレイヤーを攻撃する
function attackPlayer(state) {
  if (state.finished) return state;
  const dmg = computeDamage(state.enemy.attack, CONFIG.PLAYER_DEFENSE);
  state.playerHp = Math.max(0, state.playerHp - dmg);
  state.log.push(state.enemy.enemy_name + "の攻撃! プレイヤーに" + dmg + "ダメージ");
  return state;
}

// 勝敗を判定し、finished/result をセットする
function judgeBattleResult(state) {
  if (state.enemyHp <= 0) {
    state.finished = true;
    state.result = "win";
    state.log.push("勝利!");
  } else if (state.playerHp <= 0) {
    state.finished = true;
    state.result = "lose";
    state.log.push("敗北...");
  }
  return state;
}

// 1ターン進行: プレイヤー攻撃 → 判定 → (敵生存なら)敵攻撃 → 判定
function processTurn(state) {
  if (state.finished) return state;

  // テスト用: 強制敗北
  if (CONFIG.DEBUG_FORCE_LOSE) {
    state.playerHp = 0;
    state.log.push("(テスト)強制敗北フラグによりプレイヤーHPが0になりました");
    judgeBattleResult(state);
    return state;
  }

  attackEnemy(state);
  judgeBattleResult(state);
  if (!state.finished) {
    attackPlayer(state);
    judgeBattleResult(state);
  }
  return state;
}
