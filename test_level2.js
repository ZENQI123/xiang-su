/* ============================================================
   第二关 · 逻辑测试（headless）
   ------------------------------------------------------------
   覆盖：选关配置 / 地形隔断 / 商店定价与购买 / 升级被动 /
         双路波次 / 矿场叠加 / 低保 / 目标锁定（只有破坏者扑矿场）
   ============================================================ */
const fs = require('fs');
const src = fs.readFileSync('game.js', 'utf8');

const noop = () => {};
function mkCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (['fillStyle','strokeStyle','lineWidth','font','textAlign','imageSmoothingEnabled'].includes(k)) return t[k];
      if (k === 'canvas') return mkEl();
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
function mkEl() {
  return {
    style: {},
    classList: { add: noop, remove: noop, contains: () => false },
    children: [],
    _text: '', _html: '',
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    remove() {},
    querySelector() { return mkElementStub(); },
    addEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1232, height: 728 }),
    scrollTop: 0, scrollHeight: 0, disabled: false,
    getContext: () => mkCtx(),
    width: 0, height: 0,
    onclick: null,
  };
}
function mkElementStub() {
  return {
    onclick: null,
    classList: { add: noop, remove: noop, contains: () => false },
    style: {},
    textContent: '', innerHTML: '',
  };
}

const registry = {};
global.document = {
  getElementById: (id) => {
    if (!registry[id]) registry[id] = mkEl();
    const el = registry[id];
    /* 菜单界面视为已隐藏 → inMenuScreen() 返回 false，
       update()（轰炸/战斗循环）在测试中可以正常运行 */
    if (id === 'title-screen' || id === 'level-select' || id === 'briefing') {
      el.classList.contains = (c) => c === 'hidden';
    }
    return el;
  },
  createElement: () => mkEl(),
  addEventListener: noop,
};
global.window = { addEventListener: noop };
global.performance = { now: () => Date.now() };
/* localStorage 桩：用于验证通关记录的读写 */
const _ls = {};
global.localStorage = {
  getItem: (k) => (k in _ls ? _ls[k] : null),
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
};
global.requestAnimationFrame = noop;

let _hold = false;
const _timers = [];
global.setTimeout = (f) => {
  if (!f) return 0;
  if (_hold) { _timers.push(f); return 0; }
  f(); return 0;
};
function holdTimers(on) {
  _hold = !!on;
  if (!on) { const q = _timers.splice(0); q.forEach((f) => f()); }
}

const body = src + `
;return {
  makeUnit, applyLevel, aStar, startRound, beginSummon, tryPlaceSummon, upgradeCard,
  damageBase, commandMove, newGame, tileCenter, pxDistTiles, resolveReward, occupiedAt, attack,
  damageUnit, rawDamage, raiseSkeleton, isStunned, applyStunTo, applyPassives,
  gameTime_get: ()=>gameTime,
  endTurn, settleIncome, findTarget, terrainAt, passable, buildShopPool, refreshShop, summonLeft,
  buyShopItem, makeUnitOf: makeUnit, processNextEvent,
  unitCap, unitCount, UNIT_CAPS, UNIT_CAP_DEFAULT, EV_RATE, pickRoundEvent,
  SHOP_NEW_CARDS, allyAtkAuraMul, guardianDetonate, innateTraits,
  startKingBurst, spawnKingAt, tickKingBurst, kingGrabAllies, summonMinionsAround,
  KING_BURST_DUR, KING_BGM_SEC, playBossBgm, stopBossBgm, runEvent, update, kingPending,
  PASSIVE_INFO, openTalentDetail, closeTalentDetail,
  resolveNegEvent, resolvePosEvent, openNegModal, openPosModal, NEG_EVENTS, POS_EVENTS, SHOP_SUPPLIES, SHOP_UPGRADES,
  drawNegEvent, NEG_EVENT_WEIGHT, showEventCard, hideEventCard,
  drawPosEventPair,
  closeRewardModal, closeNegModal, closePosModal, moveAlongPath,
  update, BASE_TILE, selectUnit, canCommandUnit, unitStatLine,
  saveGame, loadGame, hasBattleSave, clearBattleSave, BATTLE_SAVE_KEY,
  CODEX_KEY, CODEX, CODEX_UNITS, CODEX_MONSTERS, codexMark, codexProgress, saveCodex, readCodex,
  renderCodex, openCodex, closeCodex, monsterStatLine, resetProgress,
  COLS, ROWS, TILE, BASE, CARD_ORDER, UPGRADE_MULT, SUMMON_PER_TURN,
  BASE_TILE, MINE_TILE, MINE_TILES, SPAWN_UPPER, SPAWN_LOWER, SPAWN_SPREAD,
  isMineTile, mineCenterTile, mineCenterPx, mineTileTerrainConflicts,
  TERRAIN_MAP,
  spawnLaneTile,
  MINE_GOLD, AP_PER_TURN, BASE_HP_MAX, TOTAL_ROUNDS, FLOOR_GOLD,
  PRICE_NEW_CARD, PRICE_LV2, PRICE_LV3, SHOP_SLOTS, REFRESH_MAX,
  LEVEL_CONFIGS, LEVEL2_ROUNDS,
  CLEARED, saveCleared, readCleared, CLEAR_SAVE_KEY,
  isLevelUnlocked, maxUnlockedLevel, nextLevelId, levelIds, buildLevelSelect,
  draftEnabled, draftPool, toggleDraftPick, openDraft, confirmDraft,
  draftPicks: ()=>DRAFT_PICKS.slice(), draftReset: ()=>{ DRAFT_PICKS = []; },
  DRAFT_FROM_LEVEL, DRAFT_MAX,
  CURRENT_LEVEL_get: ()=>CURRENT_LEVEL,
  SFX, sfx, TIER_INFO, UNIT_INTRO, INTRO_DUR, MUTE_KEY,
  ccResistOf, applyCcResist, CC_RESIST_TIER,
  queueUnitIntro, startNextIntro, tickIntro, afterIntro, clearUnitIntro, runEvent,
  resetOverlayForModal, setGameSpeed, toggleGameSpeed, stepFrame, SPEED_KEY,
  showBanner, toast, tickBanner, syncBannerEl, BANNER_SHOW_SEC, TOAST_SHOW_SEC,
  rangeUpgradeMul, RANGE_UPGRADE_STEP, spawnPreviewRemain, buildSpawnPreview,
  consumeSpawnPreview, makeSpawnPreview, drawSpawnPreviewPanel,
  GAME_SPEED_get: ()=>GAME_SPEED, openRewardModal, closeRewardModal,
  get gameTime(){ return gameTime; },
  get G(){ return G; }
};`;
const X = new Function('document','window','performance','requestAnimationFrame','setTimeout', body)(
  global.document, global.window, global.performance, global.requestAnimationFrame, global.setTimeout);
X.holdTimers = holdTimers;

/* newGame 会立刻推进第 1 回合的"选择援军"事件模态，模态打开时战场暂停；
   测试统一用 newGameSkip 跳过开局模态，保证后续 update() 正常推进 */
function newGameSkip(id){
  X.newGame(id);
  X.closeRewardModal(); X.closeNegModal(); X.closePosModal();
  X.G.choiceOpen = false;
}

/* 随机事件（负面二选一 / 增益二选一）的模态会阻塞事件链：
   - 桩拦截时事件留在队列 → 摘除后直接结算
   - 模态打开等待时队列已空 → 用 roundEvents 判断弹窗类型后直接结算 */
function passNeg(){
  const q = X.G.triggerQueue;
  const pickT = (type) => { const i = q.findIndex(e => e.type === type); if(i >= 0){ q.splice(i,1); return true; } return false; };
  if(pickT('neg_random')){ X.resolveNegEvent('lose_gold'); return; }
  if(pickT('pos_pick')){ X.resolvePosEvent('airdrop_wage'); return; }
  if(X.G.turnPhase === 'event'){
    if(X.G.roundEvents.some(e => e.type === 'pos_pick')) X.resolvePosEvent('airdrop_wage');
    else if(X.G.roundEvents.some(e => e.type === 'neg_random')) X.resolveNegEvent('lose_gold');
  }
}

const log = (...a) => console.log(...a);
let pass = 0, fail = 0;
function check(cond, msg) {
  if (cond) { pass++; log('  ✓ ' + msg); }
  else { fail++; log('  ✗ FAIL: ' + msg); }
}
function section(t){ log('\n===== ' + t + ' ====='); }

/* ============================================================ */
section('1. 关卡配置表');
const C1 = X.LEVEL_CONFIGS[1], C2 = X.LEVEL_CONFIGS[2];
check(!!C1 && !!C2, '存在第1关与第2关配置');
check(C1.rounds === 3, '第1关 3 回合');
check(C1.apPerTurn === 4, '第1关行动值 4');
check(C1.baseHp === 20, '第1关基地 20 血');
check(C1.hasShop === true, '第1关有商店（只卖升级/补给）');
check(C1.shopCards === false, '第1关商店不出售新兵种（shopCards = false）');
check(C1.spawnMul === 2, '第1关出怪倍率 ×2');
check(C1.hasTerrain === false, '第1关是教学关，不放地形');
check(C1.hasLanes === false, '第1关单路');
check(C2.rounds === 7, '第2关 7 回合');
check(C2.apPerTurn === 5, '第2关行动值 5');
check(C2.baseHp === 30, '第2关基地 30 血');
check(C2.hasShop === true, '第2关有商店');
check(C2.hasTerrain === true, '第2关有地形');
check(C2.hasLanes === true, '第2关双路');
check(C2.floorGold === 10, '第2关低保 10');
check(C1.startCards.length === 3, '第1关开局 3 张卡');

/* ============================================================ */
section('1.5 关卡解锁：通关上一关解锁下一关');
check(X.levelIds().join(',') === '1,2,3,4,5', '关卡有序列表 = [1, 2, 3, 4, 5]');
check(X.isLevelUnlocked(1) === true, '第 1 关永远解锁');
check(X.nextLevelId(1) === 2, '第 1 关的下一关是 2');
check(X.nextLevelId(2) === 3, '第 2 关的下一关是 3');
check(X.nextLevelId(3) === 4, '第 3 关的下一关是 4');
check(X.nextLevelId(4) === 5, '第 4 关的下一关是 5');
check(X.nextLevelId(5) === null, '最后一关（第五关）没有下一关');

/* 清空记录 → 第 2 关应锁定 */
for(const k in X.CLEARED) delete X.CLEARED[k];
check(X.isLevelUnlocked(2) === false, '无通关记录时第 2 关锁定');
check(X.maxUnlockedLevel() === 1, '最大可玩关卡 = 1');

/* 通关第 1 关 → 第 2 关解锁 */
X.CLEARED[1] = true;
check(X.isLevelUnlocked(2) === true, '通关第 1 关后第 2 关解锁');
check(X.maxUnlockedLevel() === 2, '最大可玩关卡 = 2');
check(X.isLevelUnlocked(3) === false, '未通关第 2 关时第 3 关仍锁定');

/* 通关第 2 关 → 第 3 关解锁 */
X.CLEARED[2] = true;
check(X.isLevelUnlocked(3) === true, '通关第 2 关后第 3 关解锁');
check(X.maxUnlockedLevel() === 3, '最大可玩关卡 = 3');

/* 只通关第 2 关（异常数据）不应反向影响第 1 关 */
for(const k in X.CLEARED) delete X.CLEARED[k];
X.CLEARED[2] = true;
check(X.isLevelUnlocked(1) === true, '第 1 关始终解锁（即使只记录了第 2 关）');
check(X.isLevelUnlocked(2) === false, '第 2 关仍需第 1 关通关记录');

/* 持久化：saveCleared 写入后可被重新读取 */
for(const k in X.CLEARED) delete X.CLEARED[k];
X.CLEARED[1] = true;
X.saveCleared();
check(X.readCleared()[1] === true, 'saveCleared 写入后能读回第 1 关记录');

/* 正式版：第四关恢复正常解锁链（需先通关第 3 关） */
for(const k in X.CLEARED) delete X.CLEARED[k];
check(!X.LEVEL_CONFIGS[4].alwaysUnlocked, '第四关不再免解锁（正式版）');
check(X.isLevelUnlocked(4) === false, '无通关记录时第四关锁定');
X.CLEARED[1] = true; X.CLEARED[2] = true;
check(X.isLevelUnlocked(4) === false, '只通两关时第四关仍锁定');
X.CLEARED[3] = true;
check(X.isLevelUnlocked(4) === true, '通关第 3 关后第四关解锁');
check(X.maxUnlockedLevel() === 4, '进度推进到第 4 关');

/* 补充：解锁判定不因关卡未玩过而报错 */
check(X.isLevelUnlocked(99) === true, '未知关卡 id 兜底放行（不抛异常）');
for(const k in X.CLEARED) delete X.CLEARED[k];

/* ============================================================ */
section('2. 地形隔断：上下两路连通性与隔离度');
newGameSkip(2);
check(X.G.lv.id === 2, 'newGame(2) 进入第二关');

function reach(s, g){ return !!X.aStar(s, g); }
check(reach(X.SPAWN_UPPER, X.MINE_TILE), '上路刷怪点 → 矿场 可达');
check(reach(X.SPAWN_UPPER, X.BASE_TILE), '上路刷怪点 → 基地 可达');
check(reach(X.SPAWN_LOWER, X.BASE_TILE), '下路刷怪点 → 基地 可达');
check(reach(X.SPAWN_LOWER, X.MINE_TILE), '下路刷怪点 → 矿场 可达（需绕行）');
check(reach(X.BASE_TILE, X.MINE_TILE), '基地 → 矿场 可达');

/* 中央隔离带：c10~c18 之间必须有整排岩壁 */
let fullWallRows = 0;
for (let r = 0; r < X.ROWS; r++) {
  let allRock = true;
  for (let c = 10; c <= 18; c++) { if (X.passable(c, r)) { allRock = false; break; } }
  if (allRock) fullWallRows++;
}
check(fullWallRows >= 3, `上下路之间存在整排岩壁隔离（${fullWallRows} 排，需 ≥3）`);

/* 上路怪路径不应下沉到下路深区（r>=10） */
const pUp = X.aStar(X.SPAWN_UPPER, X.BASE_TILE);
const upMaxR = Math.max(...pUp.map(n => n.r));
check(upMaxR < 10, `上路→基地 路径不下沉到下路（最深 r${upMaxR} < 10）`);
/* 下路怪路径不应上浮到上路深区（r<=3 且 c>=12） */
const pLow = X.aStar(X.SPAWN_LOWER, X.BASE_TILE);
const badUp = pLow.filter(n => n.r <= 3 && n.c >= 12);
check(badUp.length === 0, '下路→基地 路径不上浮到上路深处');

/* 岩石确实不可通行 */
check(!X.passable(13, 7), '岩壁 (13,7) 不可通行');
check(X.passable(9, 7), '中央通道 (9,7) 可通行');

/* ---- 第一关：教学关，关掉地形；且绝不能回退去用别关的地形表 ----
   （回归：early 版 activeTerrainMap 会回退到第二关的 TERRAIN_MAP，
     第一关看不见岩壁却仍被阻挡，士兵会莫名卡住） */
newGameSkip(1);
check(X.G.lv.hasTerrain === false, '第一关 hasTerrain = false（教学关不放地形）');
check(!X.G.lv.terrainMap, '第一关没有 terrainMap');
check(X.passable(10, 6) && X.passable(12, 6) && X.passable(13, 7), '第一关岩壁格全部可通行（不被隐形阻挡）');
check(X.terrainAt(13, 4) === null, '第一关读不到任何地形效果（也不继承第二关的高地）');
check(!!X.aStar({c:3,r:6}, {c:20,r:6}), '第一关可直线穿过第二关的岩壁区域');
newGameSkip(2);
check(!X.passable(13, 7), '切回第二关后岩壁重新生效');
newGameSkip(2);

/* 地形效果抽样 */
check(!!X.terrainAt(13, 4) && X.terrainAt(13, 4).dmgBonus > 0, '高地 (13,4) 提供伤害加成');
check(!!X.terrainAt(15, 11) && X.terrainAt(15, 11).speedMul < 1, '沼泽 (15,11) 减速');
check(!!X.terrainAt(6, 2) && X.terrainAt(6, 2).rangedReduce > 0, '树林 (6,2) 减远程伤害');

/* ============================================================ */
section('3. 商店：定价 / 购买 / 刷新');
newGameSkip(2);
X.holdTimers(true);
X.G.turnPhase = 'action';
X.G.gold = 200;
X.refreshShop(0, true);
check(X.G.shop.slots.length > 0, '货架刷新后非空');
check(X.G.shop.slots.length <= X.SHOP_SLOTS, `货架格数 ≤ ${X.SHOP_SLOTS}`);

/* 新卡定价 20 */
const pool = X.buildShopPool();
const newCard = pool.find(p => p.kind === 'card');
check(!!newCard && newCard.price === X.PRICE_NEW_CARD, `新卡定价 = ${X.PRICE_NEW_CARD}`);
check(X.PRICE_NEW_CARD === 20, '新卡 = 20 金');
check(X.PRICE_LV2 === 30, 'Lv2 升级卡 = 30 金');
check(X.PRICE_LV3 === 50, 'Lv3 升级卡 = 50 金');

/* 购买新卡：扣金、加卡、不耗行动值、不扣金币以外的东西 */
const apBefore = X.G.ap, goldBefore = X.G.gold;
X.G.shop.slots = [{ kind:'card', id:'shield', name:'盾卫', emoji:'🛡️', price:20 }];
X.buyShopItem(0);
check(!!X.G.cards.shield, '购买盾卫后手牌新增该卡');
check(X.G.gold === goldBefore - 20, '购买新卡扣 20 金币');
check(X.G.ap === apBefore, '购买新卡不消耗行动值');
check(X.G.shop.slots.length === 0, '购买后该格清空');

/* 金币不足无法购买 */
X.G.gold = 5;
X.G.shop.slots = [{ kind:'card', id:'gunner', name:'枪炮手', emoji:'🔫', price:20 }];
X.buyShopItem(0);
check(!X.G.cards.gunner, '金币不足时无法购买');
check(X.G.gold === 5, '金币不足时金币不变');

/* 升级卡：30 → Lv2；场上单位同步 */
X.G.gold = 200;
const sw = X.makeUnit('swordsman', 'player', { c: 3, r: 6 });
X.G.units.push(sw);
const hpBefore = sw.hpMax;
X.G.shop.slots = [{ kind:'upgrade', typeId:'swordsman', lv:2, name:'剑士·盾墙', price:30 }];
X.buyShopItem(0);
check(X.G.cards.swordsman.lv === 2, '购买升级卡后手牌等级 → Lv2');
check(X.G.gold === 170, 'Lv2 升级卡扣 30 金币');
check(sw.hpMax === Math.round(22 * 1.5), '场上剑士同步强化（HP 33）');

/* Lv2 → Lv3 花 50 */
X.G.shop.slots = [{ kind:'upgrade', typeId:'swordsman', lv:3, name:'剑士·反击', price:50 }];
X.buyShopItem(0);
check(X.G.cards.swordsman.lv === 3, '再次购买升级卡 → Lv3');
check(X.G.gold === 120, 'Lv3 升级卡扣 50 金币');

/* 刷新消耗 1 行动值 + 5 金币，每回合上限 2 次 */
X.G.gold = 50; X.G.ap = 5; X.G.shop.refreshLeft = X.REFRESH_MAX;
const g0 = X.G.gold, a0 = X.G.ap;
X.refreshShop(1, false);
check(X.G.gold === g0 - 5 && X.G.ap === a0 - 1, '刷新消耗 1 行动值 + 5 金币');
check(X.G.shop.refreshLeft === X.REFRESH_MAX - 1, '刷新次数 -1');
X.refreshShop(1, false);
check(X.G.shop.refreshLeft === 0, '第二次刷新后次数归零');
const g1 = X.G.gold, a1 = X.G.ap;
X.refreshShop(1, false);
check(X.G.gold === g1 && X.G.ap === a1, '超过 2 次后刷新被拒绝（不扣费）');

/* 第一关商店开放（见 3.5 详测）；未开放商店的关卡仍然拦截 */
newGameSkip(1);
X.G.turnPhase = 'action'; X.G.gold = 100; X.G.ap = 5;
check(X.refreshShop(1, false) === true, '第 1 关刷新货架返回 true（商店已开放）');
/* 模拟"无商店"关卡：临时关掉 hasShop，验证拦截仍然有效 */
const hadShop = X.G.lv.hasShop;
X.G.lv.hasShop = false;
X.G.shop.slots = [{ kind:'card', id:'shield', name:'盾卫', emoji:'🛡️', price:20 }];
X.buyShopItem(0);
check(!X.G.cards.shield, 'hasShop=false 的关卡无法购买商店物品');
check(X.refreshShop(1, false) === false, 'hasShop=false 的关卡刷新货架返回 false');
X.G.lv.hasShop = hadShop;

/* ============================================================ */
section('3.5 第 1 关商店：开放但只卖升级 / 补给，不出新兵种');
newGameSkip(1);
X.holdTimers(true);
X.G.turnPhase = 'action'; X.G.gold = 200; X.G.ap = 4;

/* 商品池不含"解锁新兵种" */
const pool1 = X.buildShopPool();
check(X.G.lv.hasShop === true, '第 1 关商店已开放');
check(!pool1.some(p => p.kind === 'card'), '第 1 关货架池不含任何新兵种（kind=card）');
check(pool1.some(p => p.kind === 'upgrade'), '第 1 关货架池含升级卡');
check(pool1.some(p => p.kind === 'supply'), '第 1 关货架池含补给');

/* 刷新出的货架同样不含新兵种 */
let anyCard = false;
for (let i = 0; i < 30; i++) {
  X.refreshShop(0, true);
  if (X.G.shop.slots.some(s => s.kind === 'card')) { anyCard = true; break; }
}
check(!anyCard, '第 1 关连续刷新 30 次都不出新兵种');

/* 购买补给 / 升级均正常 */
X.G.gold = 100;
X.G.shop.slots = [{ kind:'supply', id:'wage', name:'军饷', emoji:'💰', price:40 }];
X.buyShopItem(0);
check(X.G.gold === 60, '第 1 关可购买补给（军饷 -40 金币）');

X.G.shop.slots = [{ kind:'upgrade', typeId:'swordsman', lv:2, name:'剑士·盾墙', price:30 }];
X.buyShopItem(0);
check(X.G.cards.swordsman.lv === 2, '第 1 关可购买升级卡（剑士 → Lv2）');
check(X.G.gold === 30, '升级卡扣 30 金币');

/* 双保险：即使货架里被塞进"新兵种"，第 1 关也必须拒绝 */
X.G.gold = 200;
X.G.shop.slots = [{ kind:'card', id:'shield', name:'盾卫', emoji:'🛡️', price:20 }];
X.buyShopItem(0);
check(!X.G.cards.shield, '第 1 关拒绝购买新兵种（即使货架被塞入）');
check(X.G.gold === 200, '被拒绝时不扣金币');

/* 刷新次数与行动值规则对第 1 关同样生效 */
X.G.gold = 50; X.G.ap = 4; X.G.shop.refreshLeft = X.REFRESH_MAX;
const g1a = X.G.gold, a1a = X.G.ap;
X.refreshShop(1, false);
check(X.G.gold === g1a - 5 && X.G.ap === a1a - 1, '第 1 关刷新同样消耗 1 行动值 + 5 金币');

/* 对照：第 2 关仍然卖新兵种 */
newGameSkip(2);
X.G.turnPhase = 'action';
check(X.buildShopPool().some(p => p.kind === 'card'), '对照：第 2 关货架池仍含新兵种');

/* ============================================================ */
section('3.6 出怪倍率：第 1 关 ×2，第 2 关 ×1');
newGameSkip(1);
X.holdTimers(true);
check(X.G.lv.spawnMul === 2, '第 1 关 spawnMul = 2');

/* 第 2 回合：配置 2 只小怪 → 实际刷 4 只
   （新回合流程：startRound 只挂 pendingSpawns，玩家 endTurn 后敌人才出现） */
X.G.turnMode = null;
X.G.turnPhase = 'event';
X.G.units.length = 0;
X.startRound(2);
check(X.G.units.filter(u => u.side === 'enemy').length === 0,
  'startRound 后敌人尚未出现（出怪延后到 endTurn）');
holdTimers(false); passNeg();   // 走完事件链（负面事件二选一）→ 行动阶段
X.endTurn();         // 出怪
holdTimers(false);   // 冲刷出怪链
let enemy2 = X.G.units.filter(u => u.side === 'enemy');
check(enemy2.length === 4, `第 1 关 R2：2 只小怪 ×2 → 实际 ${enemy2.length} 只`);
check(enemy2.every(u => u.typeId === 'monster'), '第 1 关 R2 刷出的全是小怪');

/* 第 3 回合：配置 monster + boss → 2 只小怪 + 2 只 BOSS */
newGameSkip(1);
X.holdTimers(true);
X.G.turnPhase = 'event';
X.G.units.length = 0;
X.startRound(3);
holdTimers(false); passNeg();   // 走完事件链（负面事件二选一）→ 行动阶段
X.endTurn();
holdTimers(false);
const en3 = X.G.units.filter(u => u.side === 'enemy');
const mon3 = en3.filter(u => u.typeId === 'monster').length;
const bos3 = en3.filter(u => u.typeId === 'boss').length;
check(mon3 === 2 && bos3 === 2, `第 1 关 R3：monster+boss ×2 → ${mon3} 小怪 + ${bos3} BOSS`);

/* 第 1 回合：奖励事件 + 固定 1 只开场小怪（不参与 ×2 倍率） */
newGameSkip(1);
X.holdTimers(true);
X.G.turnPhase = 'event';
X.G.units.length = 0;
X.startRound(1);
check(X.G.units.filter(u => u.side === 'enemy').length === 0,
  'startRound 后场上仍无敌人（出怪延后到 endTurn）');
const r1sp = X.G.pendingSpawns.filter(s => s.type === 'spawn');
check(r1sp.length === 1 && r1sp[0].lane === 'lower'
  && r1sp[0].list.join(',') === 'monster',
  `第 1 关 R1 挂 1 只开场小怪（${r1sp.map(s => s.list.join('+')).join(' / ') || '无'}）`);
check(X.G.spawnPreview.lower.queue.join(',') === 'monster',
  '开场怪登记进出怪预告：下路 👹×1');
/* 走完奖励事件 → endTurn → 真的刷出，且不随 ×2 变成 2 只 */
holdTimers(false);
X.resolveReward('swordsman');
check(X.G.turnPhase === 'action', 'R1 奖励事件结算后进入行动阶段');
X.endTurn();
holdTimers(false);
const r1Enemy = X.G.units.filter(u => u.side === 'enemy');
check(r1Enemy.length === 1 && r1Enemy[0].typeId === 'monster',
  `第 1 关 R1 实际刷出 1 只小怪（${r1Enemy.length} 只，未随 ×2 变 2 只）`);

/* 对照：第 2 关不受倍率影响（双路波次表原样） */
newGameSkip(2);
X.holdTimers(true);
X.G.turnPhase = 'event';
X.G.units.length = 0;
X.startRound(2);   // 下路 4 只（加压版）
holdTimers(false); passNeg();   // 走完事件链（负面事件二选一）→ 行动阶段
X.endTurn();
holdTimers(false);
check(X.G.units.filter(u => u.side === 'enemy').length === 4, '对照：第 2 关 R2 刷 4 只（倍率不影响双路表）');

/* ============================================================ */
section('4. 目标锁定：只有矿场破坏者扑矿场');
newGameSkip(2);
X.holdTimers(true);
/* 放一个矿工在矿场，一个剑士在基地附近 */
const miner = X.makeUnit('miner', 'player', { c: X.MINE_TILE.c, r: X.MINE_TILE.r });
X.G.units.push(miner);
const guard = X.makeUnit('swordsman', 'player', { c: 2, r: 6 });
X.G.units.push(guard);

/* 普通小怪：目标是"最近的玩家单位或基地"，不因矿场而改变路线 */
const m1 = X.makeUnit('monster', 'enemy', { c: 19, r: 2 });
X.G.units.push(m1);
const t1 = X.findTarget(m1);
check(!t1.target || !t1.target.isMineTile, '小怪不会被矿场格吸引');
/* 关键：无 antiMine 标记的怪，其目标选择与矿场位置无关 —— 把矿工移走，目标应不变 */
const t1a = X.findTarget(m1);
miner.c = 20; miner.r = 12;                    // 把矿工挪到地图另一角
const t1b = X.findTarget(m1);
check(t1a.target === t1b.target, '小怪目标不随矿工位置改变（不被矿场吸引）');
miner.c = X.MINE_TILE.c; miner.r = X.MINE_TILE.r;

/* 破坏者：有矿工时锁定矿工 */
const s1 = X.makeUnit('sapper', 'enemy', { c: 19, r: 2 });
X.G.units.push(s1);
const t2 = X.findTarget(s1);
check(t2.target === miner, '破坏者优先锁定矿工');

/* 破坏者：无矿工时驻守矿场格（不去打基地） */
miner.alive = false;
const t3 = X.findTarget(s1);
check(!!t3.target && t3.target.isMineTile, '无矿工时破坏者驻守矿场格');
check(t3.target !== X.G.base, '无矿工时破坏者不会去打基地');

/* 攻城槌/狼骑：只打基地，无视矿场 */
const ram = X.makeUnit('ram', 'enemy', { c: 19, r: 2 });
X.G.units.push(ram);
check(X.findTarget(ram).target === X.G.base, '攻城槌只锁定基地');
const wolf = X.makeUnit('wolf', 'enemy', { c: 19, r: 2 });
X.G.units.push(wolf);
check(X.findTarget(wolf).target === X.G.base, '狼骑只锁定基地');

/* 破坏者数值（本轮全员 ×1.5 后） */
check(X.BASE.sapper.hp === 27, '矿场破坏者 HP = 27（18 ×1.5）');
check(X.BASE.sapper.dmg === 1.8, '矿场破坏者 伤害 = 1.8（1.2 ×1.5）');

/* ============================================================ */
section('5. 矿场叠加 + 每回合低保');
newGameSkip(2);
X.holdTimers(true);
X.G.turnPhase = 'action';
X.G.gold = 0;
/* 单矿工 */
const mn1 = X.makeUnit('miner', 'player', { c: X.MINE_TILE.c, r: X.MINE_TILE.r });
X.G.units.push(mn1);
let inc = X.settleIncome();
check(inc === 10 + 10, `1 矿工：低保10 + 矿工10 = ${inc}`);
/* 两矿工线性叠加 */
const mn2 = X.makeUnit('miner', 'player', { c: X.MINE_TILE.c, r: X.MINE_TILE.r });
X.G.units.push(mn2);
X.G.gold = 0;
inc = X.settleIncome();
check(inc === 10 + 20, `2 矿工：低保10 + 矿工20 = ${inc}`);
/* 未在矿场的矿工不产金 */
mn2.c = 3; mn2.r = 6;
X.G.gold = 0;
inc = X.settleIncome();
check(inc === 10 + 10, `离开矿场的矿工不产金（${inc}）`);
/* 第1关低保 10 */
newGameSkip(1);
X.G.turnPhase = 'action'; X.G.gold = 0;
X.G.units.length = 0;
const inc1 = X.settleIncome();
check(inc1 === 10, '第1关低保 10（无矿工时收入 = 10）');
/* 矿场不可摧毁：不存在"矿场血量"字段 */
check(X.G.mineHp === undefined, '矿场没有血量（不可摧毁）');

/* ============================================================ */
section('5.2 回归：多个矿工都能被"派往矿场"（曾经只能上一个）');
/* 背景：矿场原本是单格，而 commandMove 里 `if(occupiedAt(c,r)) return` 会
   把所有已占用的目标格拒掉 —— 第一个矿工站上矿场后，第二个矿工就永远
   走不进去（提示"目标格已被占用"）。但产金逻辑本就按矿工线性叠加，
   设计上就该允许多个矿工同采。
   修法：矿工前往矿场时豁免叠加占位检查（occupiedAt(c,r,true)）。
   注：矿场现已扩为 2×2 共 4 格，本节仍以锚点格 (10,2) 作代表，
       四格的整体覆盖见 5.3 节。 */
newGameSkip(2);
X.holdTimers(true);
X.G.turnPhase = 'action';
X.G.units.length = 0;

/* 第 1 个矿工：站到矿场格上 */
const st1 = X.makeUnit('miner', 'player', { c: X.MINE_TILE.c, r: X.MINE_TILE.r });
X.G.units.push(st1);
check(X.occupiedAt(X.MINE_TILE.c, X.MINE_TILE.r) === true,
  '有矿工在矿场时，矿场格对普通判定 = 已占用');
check(X.occupiedAt(X.MINE_TILE.c, X.MINE_TILE.r, true) === false,
  '开启矿工豁免后，矿场格对该矿工 = 可叠加');

/* 第 2 个矿工：从远处命令前往矿场（真实玩家操作） */
const st2 = X.makeUnit('miner', 'player', { c: 3, r: 6 });
X.G.units.push(st2);
X.commandMove(st2, X.MINE_TILE.c, X.MINE_TILE.r);
check(!!st2.moving && !!st2.path && st2.path.length > 0,
  '第 2 个矿工成功接受到矿场的移动命令（不再被"已占用"拒绝）');

/* 第 3 个矿工同样可以 */
const st3 = X.makeUnit('miner', 'player', { c: 3, r: 7 });
X.G.units.push(st3);
X.commandMove(st3, X.MINE_TILE.c, X.MINE_TILE.r);
check(!!st3.moving, '第 3 个矿工也能被派往矿场（可无限叠加）');

/* 非矿工仍不能被派往已占用的矿场格（豁免只对矿工生效） */
const sd = X.makeUnit('swordsman', 'player', { c: 4, r: 6 });
X.G.units.push(sd);
X.commandMove(sd, X.MINE_TILE.c, X.MINE_TILE.r);
check(!sd.moving, '剑士依旧不能进入已被占用的矿场格（豁免仅限矿工）');

/* 敌人也不能把矿场格当作可落点 */
check(X.occupiedAt(X.MINE_TILE.c, X.MINE_TILE.r) === true,
  '敌人 / 其他判定仍视矿场为已占用');

/* 叠加后的产金仍然线性：3 个矿工 → 15 + 30 */
st2.c = X.MINE_TILE.c; st2.r = X.MINE_TILE.r;
st3.c = X.MINE_TILE.c; st3.r = X.MINE_TILE.r;
X.G.gold = 0;
const incStack = X.settleIncome();
check(incStack === 10 + 30, `3 个矿工同采：低保10 + 矿工30 = ${incStack}`);

/* ============================================================ */
section('5.3 矿场 4 格：范围判定 / 通行 / 每格独立产金');
/* 矿场从 1 格扩为 2×2 共 4 格，锚点仍是 (10,2)：
     (10,2) (11,2)
     (10,3) (11,3)
   规则：4 格都算"在矿场"；矿场是建筑物 → 覆盖底下地形（一律可通行、无地形效果）。 */

/* --- 5.3.1 isMineTile 覆盖范围 --- */
check(X.MINE_TILES.length === 4, `矿场共 4 格（实际 ${X.MINE_TILES.length}）`);
check(X.isMineTile(10,2) && X.isMineTile(11,2) && X.isMineTile(10,3) && X.isMineTile(11,3),
  '4 格全部被 isMineTile 识别');
check(!X.isMineTile(9,2) && !X.isMineTile(12,2) && !X.isMineTile(10,1) && !X.isMineTile(10,4),
  '相邻的非矿场格不被识别（左/右/上/下 均排除）');
check(!X.isMineTile(12,3) && !X.isMineTile(9,3), '斜向相邻格也不算矿场');
/* MINE_TILES 列表与 isMineTile 判定一致 */
check(X.MINE_TILES.every(t => X.isMineTile(t.c, t.r)), 'MINE_TILES 每格都通过 isMineTile');

/* 整块中心 =
     ？？ ？？
   (10.5, 2.5)，像素中心 = (11*TILE, 3*TILE) */
const mc = X.mineCenterTile();
check(mc.c === 10.5 && mc.r === 2.5,
  `矿场中心格坐标 = (${mc.c}, ${mc.r})`);
const mpx = X.mineCenterPx();
/* 整块 2×2 的像素中心 = 第 (11,3) 格的格心 = (11*TILE+TILE/2, 3*TILE+TILE/2) */
const expectX = 11 * X.TILE + X.TILE / 2;
const expectY = 3 * X.TILE + X.TILE / 2;
check(mpx.x === expectX && mpx.y === expectY,
  `矿场像素中心 = (${mpx.x}, ${mpx.y})，即 2×2 整块的正中`);
/* 整块四角像素范围 */
check(X.TILE * 10 === 560 && X.TILE * 4 === 224,
  '整块像素范围：x 560~672，y 112~224（2×2）');

/* --- 5.3.2 地形被矿场覆盖 --- */
check(X.mineTileTerrainConflicts().length === 0,
  `矿场 4 格上没有残留的阻挡地形（实际冲突 ${X.mineTileTerrainConflicts().length} 个）`);
check(X.terrainAt(10,2) === null && X.terrainAt(11,2) === null &&
      X.terrainAt(10,3) === null && X.terrainAt(11,3) === null,
  '矿场 4 格读不到任何地形效果（不减速 / 不加伤）');
check(X.passable(10,2) && X.passable(11,2) && X.passable(10,3) && X.passable(11,3),
  '矿场 4 格全部可通行（原本 (11,2) 是沼泽、(10,3) 是岩石）');
/* (11,2) 原本是沼泽、(10,3) 原本是岩石 —— 现已让位 */
check(X.terrainAt(9, 2) && X.terrainAt(9, 2).speedMul < 1,
  '原 (11,2) 的沼泽西移到 (9,2)，沼泽地形没有丢失');

/* --- 5.3.2b 地形覆盖是"硬保证"，不只是靠地形表里没写 ---
   即使有人误把地形写回矿场格，terrainAt 也必须返回 null。
   （这是防回归的关键：地形表是数据，人改了不会报错。） */
for (const t of X.MINE_TILES) {
  X.TERRAIN_MAP.set(t.c + ',' + t.r, 'rock');     // 故意写回"岩石"
}
let covered = true;
for (const t of X.MINE_TILES) {
  if (X.terrainAt(t.c, t.r) !== null) covered = false;
  if (!X.passable(t.c, t.r)) covered = false;
}
check(covered, '即使地形表里写回岩石，矿场 4 格仍无地形且可通行（覆盖是硬保证）');
/* 清掉人为污染，恢复干净状态 */
for (const t of X.MINE_TILES) X.TERRAIN_MAP.delete(t.c + ',' + t.r);
check(X.mineTileTerrainConflicts().length === 0, '清理后矿场 4 格无地形冲突');

/* --- 5.3.3 四格每格独立产金 --- */
newGameSkip(2);
X.holdTimers(true);
X.G.turnPhase = 'action';
X.G.units.length = 0;
X.G.gold = 0;
/* 四格各放一个矿工 → 4 × 10 = 40 */
X.MINE_TILES.forEach((t, i) => {
  X.G.units.push(X.makeUnit('miner', 'player', { c: t.c, r: t.r }));
});
check(X.G.units.filter(u => u.typeId === 'miner').length === 4, '矿场 4 格各驻 1 名矿工');
let inc4 = X.settleIncome();
check(inc4 === 10 + 40, `4 格各 1 矿工：低保10 + 矿工40 = ${inc4}`);

/* 两格空着 → 只算驻人的两格 */
X.G.units.length = 0;
X.G.gold = 0;
X.G.units.push(X.makeUnit('miner', 'player', { c: 10, r: 2 }));
X.G.units.push(X.makeUnit('miner', 'player', { c: 11, r: 3 }));
let inc2 = X.settleIncome();
check(inc2 === 10 + 20, `只驻 2 格：低保10 + 矿工20 = ${inc2}`);

/* 同格叠 2 个矿工 → 该格算 2 份 */
X.G.units.length = 0;
X.G.gold = 0;
X.G.units.push(X.makeUnit('miner', 'player', { c: 11, r: 2 }));
X.G.units.push(X.makeUnit('miner', 'player', { c: 11, r: 2 }));
let incS = X.settleIncome();
check(incS === 10 + 20, `同一格叠 2 矿工：低保10 + 矿工20 = ${incS}（同格线性叠加）`);

/* 4 格都驻 + 同格再叠一个 → 5 份 */
X.G.units.length = 0;
X.G.gold = 0;
X.MINE_TILES.forEach(t => X.G.units.push(X.makeUnit('miner', 'player', { c: t.c, r: t.r })));
X.G.units.push(X.makeUnit('miner', 'player', { c: 10, r: 3 }));
let inc5 = X.settleIncome();
check(inc5 === 10 + 50, `4 格 + 同格叠 1 = 5 名矿工：低保10 + 矿工50 = ${inc5}`);

/* --- 5.3.4 矿场外不产金（对照） --- */
X.G.units.length = 0;
X.G.gold = 0;
X.G.units.push(X.makeUnit('miner', 'player', { c: 9, r: 2 }));    // 紧邻矿场但不是矿场
X.G.units.push(X.makeUnit('miner', 'player', { c: 12, r: 3 }));
let incOut = X.settleIncome();
check(incOut === 10, `矿场外的矿工不产金（只有低保 15，实际 ${incOut}）`);

/* --- 5.3.5 四格都能被"派往矿场"（叠加豁免覆盖 4 格） --- */
newGameSkip(2);
X.holdTimers(true);
X.G.turnPhase = 'action';
X.G.units.length = 0;
X.MINE_TILES.forEach((t, i) => {
  const m = X.makeUnit('miner', 'player', { c: 3, r: 6 + i });
  X.G.units.push(m);
  X.commandMove(m, t.c, t.r);
  check(!!m.moving, `矿工可被派往矿场第 ${i + 1} 格 (${t.c},${t.r})`);
});
/* 已经有人站在 (10,2)，第 5 个矿工仍能进同一格（叠加豁免） */
const stX = X.makeUnit('miner', 'player', { c: 4, r: 8 });
X.G.units.push(stX);
const st1x = X.makeUnit('miner', 'player', { c: 10, r: 2 });
X.G.units.push(st1x);
stX.c = 4; stX.r = 8;
X.commandMove(stX, 10, 2);
check(!!stX.moving, '矿场格已有人时，新矿工仍可进入同一格（叠加豁免覆盖 4 格）');
/* 剑士不能占用矿场格 */
const sdX = X.makeUnit('swordsman', 'player', { c: 4, r: 9 });
X.G.units.push(sdX);
X.commandMove(sdX, 10, 2);
check(!sdX.moving, '剑士不能进入矿场格（豁免仍只对矿工生效）');

/* --- 5.3.6 刷怪不会落在矿场 4 格上 --- */
newGameSkip(2);
X.holdTimers(true);
let spawnOnMine = 0;
for (let i = 0; i < 400; i++) {
  const t = X.spawnLaneTile('upper', 'monster');
  if (X.isMineTile(t.c, t.r)) spawnOnMine++;
}
check(spawnOnMine === 0, `上路刷怪 400 次都不落在矿场 4 格上（实际 ${spawnOnMine} 次）`);

/* ============================================================ */
section('5.5 移动不消耗行动值');
newGameSkip(2);
X.holdTimers(true);
X.G.turnPhase = 'action';
X.G.units.length = 0;
const mv1 = X.makeUnit('swordsman', 'player', { c: 3, r: 6 });
X.G.units.push(mv1);
let apStart = X.G.ap;
X.commandMove(mv1, 4, 6);
check(X.G.ap === apStart, `单次移动后行动值不变（${apStart} → ${X.G.ap}）`);
check(!!mv1.path, '移动命令生成路径');
/* 连续多次移动仍不扣行动值 */
X.commandMove(mv1, 5, 6);
X.commandMove(mv1, 6, 6);
X.commandMove(mv1, 5, 7);
check(X.G.ap === apStart, `连续 4 次移动后行动值仍不变（${apStart}）`);
/* 行动值为 0 时依然能移动 */
X.G.ap = 0;
const mv2 = X.makeUnit('archer', 'player', { c: 3, r: 7 });
X.G.units.push(mv2);
X.commandMove(mv2, 4, 7);
check(!!mv2.path, '行动值为 0 时仍可下达移动命令');
/* 召唤依然消耗 1 行动值（对照） */
X.G.ap = 5;
X.G.cards.swordsman.summonCountThisTurn = 0;
X.beginSummon('swordsman');
X.tryPlaceSummon(2, 6);
check(X.G.ap === 4, '对照：召唤仍消耗 1 行动值');

/* ============================================================ */
section('5.6 每种兵每回合可召唤 2 次');
newGameSkip(2);
X.holdTimers(true);
X.G.turnPhase = 'action';
X.G.units.length = 0;
X.G.ap = 5;

const SC = X.G.cards.swordsman;
check(X.SUMMON_PER_TURN === 2, `召唤上限常量 = 2`);
check(X.summonLeft(SC) === 2, '开局剑士剩余 2 次');

/* 第 1 次 */
X.beginSummon('swordsman');
X.tryPlaceSummon(2, 6);
check(X.G.ap === 4, '第 1 次召唤后 AP 5→4');
check(X.summonLeft(SC) === 1, '剩余 1 次');

/* 第 2 次（同回合同卡） */
X.beginSummon('swordsman');
check(!!X.G.pendingSummon, '同回合同卡可发起第 2 次召唤');
X.tryPlaceSummon(3, 6);
check(X.G.ap === 3, '第 2 次召唤后 AP 4→3');
check(X.summonLeft(SC) === 0, '剩余 0 次');
check(X.G.units.filter(u => u.typeId === 'swordsman').length === 2, '场上出现 2 个剑士');

/* 第 3 次应被拒绝，且不扣任何资源 */
X.beginSummon('swordsman');
check(X.G.pendingSummon === null, '第 3 次召唤被拒绝（超上限）');
check(X.G.ap === 3, '被拒绝时不扣行动值');

/* 兵种之间计数独立 */
const AC = X.G.cards.archer;
check(X.summonLeft(AC) === 2, '弓箭手次数不受剑士影响（仍为 2）');
X.beginSummon('archer');
X.tryPlaceSummon(2, 7);
check(X.G.units.filter(u => u.typeId === 'archer').length === 1, '弓箭手可正常召唤');

/* 行动值耗尽优先于次数限制（30 血下 AP 只有 5，2 次/卡 × 3 卡 = 6 次，必须靠 AP 卡住） */
X.G.ap = 0;
X.beginSummon('miner');
check(X.G.pendingSummon === null, '行动值为 0 时无法召唤（AP 为硬约束）');

/* 新回合重置 */
X.startRound(3);
check(X.summonLeft(X.G.cards.swordsman) === 2, '新回合剑士次数重置为 2');
check(X.summonLeft(X.G.cards.archer) === 2, '新回合弓箭手次数重置为 2');
check(X.G.cards.swordsman.summonCountThisTurn === 0, '计数字段归零');

/* ============================================================ */
section('6. 双路波次表（加压版）');
check(Object.keys(X.LEVEL2_ROUNDS).length === 7, '第二关共 7 个回合波次');
check(!!X.LEVEL2_ROUNDS[1].reward, 'R1 有奖励事件');
check(X.LEVEL2_ROUNDS[1].upper.length === 0 && X.LEVEL2_ROUNDS[1].lower.length === 0,
  'R1 波次表为空（开场 1 只垫怪由 startRound 统一注入）');
check(X.LEVEL2_ROUNDS[2].lower.length === 4, 'R2 下路刷 4 只（加压：2→4）');
check(X.LEVEL2_ROUNDS[7].upper.includes('warlord'), 'R7 上路出现 BOSS');
check(!X.LEVEL2_ROUNDS[3].upper.includes('boss'), 'R3 无 BOSS（已改到 R7）');

/* 加压断言：总量 +42%，高级怪提前 */
const l2Total = Object.values(X.LEVEL2_ROUNDS)
  .reduce((n, w) => n + (w.upper?.length || 0) + (w.lower?.length || 0), 0);
check(l2Total === 42, `第二关敌人总数 = 42（原 26，+62%）`);
check(X.LEVEL2_ROUNDS[3].lower.includes('shaman'), '萨满提前到 R3（原 R4）');
check(X.LEVEL2_ROUNDS[5].lower.includes('wolf'), '狼骑仍在 R5');
check(X.LEVEL2_ROUNDS[7].lower.length >= 4, `R7 下路 ${X.LEVEL2_ROUNDS[7].lower.length} 只（原 2）`);
check(X.LEVEL2_ROUNDS[7].upper.length >= 3, 'R7 上路 3 只（BOSS + 破坏者 + 萨满）');

/* ---- 每关第 1 回合都固定刷 1 只普通怪（垫怪，不受倍率影响）---- */
for(const [lvId, name] of [[1,'第1关'],[2,'第2关'],[3,'第3关']]){
  newGameSkip(lvId);
  X.holdTimers(true);
  X.G.turnPhase = 'event';
  X.startRound(1);
  const sp = X.G.pendingSpawns.filter(s => s.type === 'spawn');
  check(sp.length === 1 && sp[0].list.join(',') === 'monster'
    && sp[0].lane === 'lower',
    `${name} R1 固定挂 1 只小怪垫怪（${sp.map(s => s.list.join('+')).join(' / ') || '无'}）`);
}
/* 垫怪只在 R1 生效：R2 起 pendingSpawns 只来自波次表 */
newGameSkip(3);
X.holdTimers(true);
X.G.turnPhase = 'event';
X.startRound(2);
const r2sp = X.G.pendingSpawns.filter(s => s.type === 'spawn');
check(r2sp.length === 1 && r2sp[0].list.length === X.LEVEL_CONFIGS[3].waves[2].list.length,
  `第3关 R2 无额外垫怪（波次 ${r2sp[0] ? r2sp[0].list.length : 0} 只 = 表内 ${X.LEVEL_CONFIGS[3].waves[2].list.length} 只）`);
/* R2→R6 逐回合加压（R7 数量略降但上了 BOSS，不算减压） */
let nonDecreasing = true, prev = 0;
for (let r = 2; r <= 6; r++) {
  const cnt = (X.LEVEL2_ROUNDS[r].upper?.length || 0) + (X.LEVEL2_ROUNDS[r].lower?.length || 0);
  if (cnt < prev) nonDecreasing = false;
  prev = cnt;
}
check(nonDecreasing, 'R2→R6 每回合敌人数量递增（压力爬坡）');
check(X.LEVEL2_ROUNDS[7].upper.includes('warlord') && X.LEVEL2_ROUNDS[7].upper.includes('shaman'),
  'R7 仍旧是最难的一回合（BOSS + 萨满 + 破坏者）');

/* 双路刷怪落在各自刷怪点附近 */
newGameSkip(2); X.holdTimers(true);
X.G.turnPhase = 'event';
X.G.units.length = 0;
X.startRound(3);   // 上路1小怪 + 下路2小怪+1萨满
holdTimers(false); passNeg();   // 走完事件链（负面事件二选一）→ 行动阶段
X.endTurn();
holdTimers(false);
const upper = X.G.units.filter(u => u.side === 'enemy' && u.r <= 5);
const lower = X.G.units.filter(u => u.side === 'enemy' && u.r >= 9);
check(upper.length >= 1, `上路出现敌人（${upper.length} 只）`);
check(lower.length >= 3, `下路出现敌人（${lower.length} 只）`);

/* ============================================================ */
section('6.5 兵种场上上限（UNIT_CAPS）');
check(X.UNIT_CAPS.miner === 4 && X.UNIT_CAPS.swordsman === 4,
  '上限表：miner 4（=矿场格数）/ swordsman 4');
check(X.unitCap('gunner') === 4 && X.unitCap('unknown_x') === X.UNIT_CAP_DEFAULT,
  'unitCap 兜底默认 4');

newGameSkip(1);
X.holdTimers(true);
// 直接塞满场上：4 名矿工（= 矿场 4 格）
for(let i=0;i<4;i++){
  X.G.units.push(X.makeUnit('miner','player',{c:3+i,r:6}));
}
check(X.unitCount('miner') === 4, 'unitCount 统计 4 名存活矿工');
X.G.turnPhase = 'action';   // 事件链在 hold 下未走完，手动置于行动阶段
X.G.ap = 4;
X.beginSummon('miner');
check(X.G.pendingSummon === null, '矿工满编（4/4）时 beginSummon 被拦截（不进入选点）');
// 拿掉一名矿工后可再次召唤
X.G.units[X.G.units.length-1].alive = false;
check(X.unitCount('miner') === 3, '矿工阵亡 1 名 → 3/4（死亡腾名额）');
X.beginSummon('miner');
check(!!X.G.pendingSummon && X.G.pendingSummon.cardId === 'miner',
  '有空位（3/4）时可以进入召唤选点');
X.G.pendingSummon = null;
// 事件奖励白送的单位不受限但占名额
const gifted = X.makeUnit('swordsman','player',{c:2,r:7});
X.G.units.push(gifted);
check(X.unitCount('swordsman') === 1, '白送单位计入场上数量');

/* ============================================================ */
section('6.8 事件系统扩充 + 升级满血');
check(Object.keys(X.NEG_EVENTS).length >= 5, '负面事件池 ≥ 5 种（含疲惫/苛税）');
check(Object.keys(X.POS_EVENTS).length >= 6, '增益事件池 ≥ 6 种（军饷/动员/修缮/火力支援/天降神兵/天官赐福）');
check(X.NEG_EVENTS.fatigue && X.NEG_EVENTS.heavy_tax, '新增负面事件：全军疲惫 / 苛捐杂税');
check(X.POS_EVENTS.airdrop_wage && X.POS_EVENTS.mobilize && X.POS_EVENTS.repair && X.POS_EVENTS.fire_support,
  '增益事件：空投军饷 / 战前动员 / 基地修缮 / 火力支援');

/* 战前动员：行动值 +2 可突破上限
   增益事件在回合开头触发，此时 ap 已被重置为满值 —— 若封顶则事件完全无效，故必须允许破上限 */
newGameSkip(1);
X.G.turnPhase = 'event';
X.G.ap = X.G.apMax;
X.resolvePosEvent('mobilize');
check(X.G.ap === X.G.apMax + 2, `战前动员突破行动值上限（${X.G.ap} = ${X.G.apMax}+2）`);

/* 火力支援：本回合己方伤害 ×1.3，下一回合开始时重置 */
newGameSkip(1);
check(X.G.allyDmgMul === 1, '开局己方伤害倍率 = 1');
X.resolvePosEvent('fire_support');
check(X.G.allyDmgMul === 1.3, '火力支援：己方伤害倍率 = 1.3');
const fsAtk = X.makeUnit('swordsman', 'player', { c:5, r:6 });
const fsFoe = X.makeUnit('monster', 'enemy', { c:6, r:6 });
const fsHpBefore = fsFoe.hp;
X.G.turnPhase = 'action';
X.attack(fsAtk, fsFoe);
check(Math.abs((fsHpBefore - fsFoe.hp) - 1.1 * 1.3) < 1e-6,
  `火力支援生效：剑士一刀伤害 ${fsHpBefore - fsFoe.hp}（= 1.1 × 1.3）`);
X.holdTimers(true);
X.startRound(2);
X.closeRewardModal(); X.closeNegModal(); X.closePosModal(); X.G.choiceOpen = false;
check(X.G.allyDmgMul === 1, '新回合开始：火力支援效果重置为 1');

/* ---------- 第三十轮：天降神兵（低概率）+ 天官赐福 ---------- */
check(X.POS_EVENTS.divine_soldier && X.POS_EVENTS.blessing, '新增增益事件：天降神兵 / 天官赐福');
check(X.POS_EVENTS.divine_soldier.weight === 0.25, '天降神兵为低概率稀有事件（权重 0.25，其余缺省 1）');

/* 加权抽取：不会重复抽同一事件；天降神兵频率显著低于普通事件 */
const drawCnt = {};
let dupPairs = 0;
for(let i=0;i<6000;i++){
  const [pa, pb] = X.drawPosEventPair();
  if(pa === pb) dupPairs++;
  drawCnt[pa] = (drawCnt[pa]||0)+1;
  drawCnt[pb] = (drawCnt[pb]||0)+1;
}
check(dupPairs === 0, '加权抽取：二选一不会出现两个相同事件');
const totalDraws = 12000;
const divineFreq = (drawCnt.divine_soldier||0)/totalDraws;
check(divineFreq > 0.005 && divineFreq < 0.08,
  `天降神兵抽取频率 ${(divineFreq*100).toFixed(1)}%（期望 ≈4.8%，远低于普通事件）`);
check((drawCnt.airdrop_wage||0)/totalDraws > 0.1, '普通事件（空投军饷）抽取频率正常（>10%）');

/* 天降神兵：召唤守卫者（80血/3攻）到基地旁，事件专属不进手牌 */
newGameSkip(1);
const gBefore = X.G.units.length;
X.resolvePosEvent('divine_soldier');
const gua = X.G.units.find(u=>u.typeId==='guardian');
check(X.G.units.length === gBefore+1 && !!gua, '天降神兵：场上多出 1 名守卫者');
check(gua && gua.hpMax === 80 && gua.dmg === 3, `守卫者数值 80血/3攻（实际 ${gua&&gua.hpMax}血/${gua&&gua.dmg}攻）`);
check(gua && gua.side==='player' && gua.kind==='melee', '守卫者是己方近战单位');
check(!X.G.cards.guardian, '守卫者事件专属，不加入手牌/商店');

/* 天官赐福：随机己方单位数值翻倍，当前血量一并翻倍，升级后保留 */
newGameSkip(1);
const bs = X.makeUnit('swordsman','player',{c:5,r:6});
X.G.units.push(bs);
X.resolvePosEvent('blessing');
check(bs.blessed === true && bs.hpMax === 44 && bs.dmg === 2.2 && bs.atkRate === 2 && bs.moveSpeed === 2,
  `天官赐福：剑士数值翻倍（${bs.hpMax}血/${bs.dmg}攻/${bs.atkRate}攻速/${bs.moveSpeed}移速）`);
check(bs.hp === 44, '天官赐福：当前血量也翻倍');
bs.lv = 2; X.applyLevel(bs);
check(bs.hpMax === 66 && bs.dmg === 3.3, '祝福在升级后保留（Lv2 应为 66血/3.3攻）');
check(bs.range === 1.5, '射程不随祝福翻倍（仅随升级线性成长）');

/* 天官赐福兜底：场上无己方单位 → 折现 20 金币 */
newGameSkip(1);
const goldB = X.G.gold;
X.resolvePosEvent('blessing');
check(X.G.gold === goldB+20, '无可赐福目标时折现 +20 金币');

/* 已赐福单位不重复叠加（全场都已赐福 → 折现） */
newGameSkip(1);
const bs2 = X.makeUnit('swordsman','player',{c:5,r:6});
bs2.blessed = true;
X.G.units.push(bs2);
const goldB2 = X.G.gold;
X.resolvePosEvent('blessing');
check(bs2.hpMax === 22 && X.G.gold === goldB2+20, '已赐福单位不重复翻倍（全场已赐福则折现）');

/* 升级满血：受伤士兵升级后血量回满 */
newGameSkip(1);
const hurt = X.makeUnit('swordsman', 'player', { c:3, r:6 });
hurt.hp = 1;
X.G.cards.swordsman.lv = 2;
hurt.lv = 2;
X.applyLevel(hurt);
check(hurt.hp === hurt.hpMax && hurt.hpMax > 20, `受伤士兵升级后满血（${hurt.hp}/${hurt.hpMax}）`);

/* 军饷售价 40 */
check(X.SHOP_SUPPLIES.find(s => s.id==='wage').price === 40, '军饷卖价 = 40 金币');

/* ---------- 第三十一轮：负面事件「天打雷劈」+ 行动值突破上限 ---------- */
check(!!X.NEG_EVENTS.thunder, '新增负面事件：天打雷劈');
check(Object.keys(X.NEG_EVENTS).length >= 6, '负面事件池 ≥ 6 种（含天打雷劈）');
/* 测试辅助：钉住单位（关掉自动前压），让落雷落点可控 */
const pinUnit = (u) => { u.manualOrder = true; u.path = null; u.moving = false; u.autoMove = false; return u; };

/* 事件初始化：随机锁定 2 名己方单位（基地除外），参数 5 道雷 / 7 伤 / 半径 1 格 / 预警 2 秒 / 间隔 3 秒 */
newGameSkip(1);
X.holdTimers(true);
const tA = pinUnit(X.makeUnit('swordsman','player',{c:4,r:6})); tA.hp = tA.hpMax = 200;
const tB = pinUnit(X.makeUnit('archer','player',{c:6,r:6}));    tB.hp = tB.hpMax = 200;
X.G.units.push(tA, tB);
X.resolveNegEvent('thunder');
const TH = X.G.thunder;
check(!!TH, '天打雷劈：事件生效并写入 G.thunder');
check(TH.total === 5 && TH.dmg === 7 && TH.radius === 1 && TH.warn === 2 && TH.interval === 3,
  `天打雷劈参数：${TH.total} 道雷 / ${TH.dmg} 伤 / 半径 ${TH.radius} 格 / 预警 ${TH.warn} 秒 / 间隔 ${TH.interval} 秒`);
check(TH.uids.length === 2 && TH.uids.includes(tA.uid) && TH.uids.includes(tB.uid),
  '天打雷劈：随机锁定 2 名己方单位');

/* 场上只有 1 名单位 → 只锁 1 个；空场 → 无功而返且不报错 */
newGameSkip(1);
X.holdTimers(true);
const solo = pinUnit(X.makeUnit('swordsman','player',{c:5,r:6})); solo.hp = solo.hpMax = 200;
X.G.units.push(solo);
X.resolveNegEvent('thunder');
check(X.G.thunder.uids.length === 1, '场上只有 1 名可锁定单位时只锁 1 个');
newGameSkip(1);
X.resolveNegEvent('thunder');
check(X.G.thunder === null, '场上没有己方单位时天打雷劈无功而返（不写入状态）');

/* 节奏与命中：预警 2 秒 → 落雷；半径 1 格内受伤、斜角 1.41 格不受波及；不伤基地 */
newGameSkip(1);
X.holdTimers(true);
X.G.turnPhase = 'action';
const core = pinUnit(X.makeUnit('swordsman','player',{c:5,r:6})); core.hp = core.hpMax = 200;  // 雷击中心
const adj  = pinUnit(X.makeUnit('archer','player',{c:6,r:6}));    adj.hp  = adj.hpMax  = 200;  // 距离 1 格
const diag = pinUnit(X.makeUnit('archer','player',{c:6,r:7}));    diag.hp = diag.hpMax = 200;  // 斜角 ≈1.41 格
X.G.units.push(core, adj, diag);
X.resolveNegEvent('thunder');
X.G.thunder.uids = [core.uid];
X.G.thunder.nextIn = 0;
const thBaseHp0 = X.G.baseHp;
X.update(0.1);
check(X.G.thunderWarnings.length === 1, '第 1 道雷立刻进入预警');
check(Math.abs(X.G.thunderWarnings[0].timer - 2) < 0.11,
  `预警时长 2 秒（剩余 ${X.G.thunderWarnings[0].timer.toFixed(2)} 秒）`);
check(core.hp === 200, '预警期间不落雷（1 秒前未受伤）');
X.update(1.0);
check(core.hp === 200, '预警 1 秒时仍未落雷');
X.update(1.2);
check(core.hp === 193, `预警 2 秒后落雷：7 点伤害（200 → ${core.hp}）`);
check(adj.hp === 193, '落雷波及距离 1 格的相邻单位（半径 1 格）');
check(diag.hp === 200, '斜角 1.41 格在半径 1 格外，不受波及');
check(X.G.baseHp === thBaseHp0, '落雷不伤基地');
check(X.G.thunderWarnings.length === 0, '落雷后预警清除');

/* 雷与雷间隔 3 秒：落雷后 1 秒内不出新预警，到 3 秒才有下一道 */
X.update(0.5);
check(X.G.thunderWarnings.length === 0, '距上一道雷不足 3 秒时不出新预警');
X.update(0.5);
check(X.G.thunderWarnings.length === 1, '距上一道雷约 3 秒时第 2 道雷进入预警');

/* 预警钉在出预警那一刻的格子上 —— 走开 2 格即可躲过 */
newGameSkip(1);
X.holdTimers(true);
X.G.turnPhase = 'action';
const dodger = pinUnit(X.makeUnit('swordsman','player',{c:5,r:6})); dodger.hp = dodger.hpMax = 200;
X.G.units.push(dodger);
X.resolveNegEvent('thunder');
X.G.thunder.uids = [dodger.uid];
X.G.thunder.nextIn = 0;
X.update(0.1);
const safeCtr = X.tileCenter(8, 6);
dodger.c = 8; dodger.r = 6; dodger.x = safeCtr.x; dodger.y = safeCtr.y;
X.update(2.1);
check(dodger.hp === 200, '被锁定的单位在预警期内走开 2 格 → 躲过落雷');

/* 完整节奏：5 道雷全部落下后状态自动清空（站桩单位 5×7=35 伤） */
newGameSkip(1);
X.holdTimers(true);
X.G.turnPhase = 'action';
const tank = pinUnit(X.makeUnit('swordsman','player',{c:5,r:6})); tank.hp = tank.hpMax = 500;
X.G.units.push(tank);
X.resolveNegEvent('thunder');
X.G.thunder.uids = [tank.uid];
X.G.thunder.nextIn = 0;
for(let i=0;i<1200;i++) X.update(1/60);   // 20 秒：足够 5 道雷（0/3/6/9/12 秒预警）走完
check(tank.hp === 465, `5 道雷全部命中站桩单位（共 ${500-tank.hp} 伤）`);
check(X.G.thunder === null && X.G.thunderWarnings.length === 0, '5 道雷打完后落雷状态自动清空');

/* 军饷 +3 行动值：可突破上限，但 apMax 本身不变；新回合回到上限 */
newGameSkip(1);
X.holdTimers(true);
X.G.turnPhase = 'action';
X.G.ap = X.G.apMax;
X.G.gold = 100;
X.G.shop.slots = [{ kind:'supply', id:'wage', name:'军饷', emoji:'💰', price:40 }];
X.buyShopItem(0);
check(X.G.ap === X.G.apMax + 3, `军饷 +3 行动值可突破上限（${X.G.ap}）`);
check(X.G.apMax === 4, `行动值上限本身不变（第一关 ${X.G.apMax} 点）`);
const rndKeep = Math.random;
Math.random = () => 0.99;          // 屏蔽随机事件，只验证回合重置语义
X.startRound(2);
Math.random = rndKeep;
X.closeRewardModal(); X.closeNegModal(); X.closePosModal(); X.G.choiceOpen = false;
check(X.G.ap === X.G.apMax, `新回合开始：行动值回到上限（${X.G.ap} / ${X.G.apMax}，不留 7 格）`);
check(X.G.thunder === null && X.G.thunderWarnings.length === 0, '新回合开始：残留落雷状态一并清空');

/* ============================================================ */
section('6.9 第三关新 BOSS：毁灭魔龙 + 攻城领主强化');
const OV = X.BASE.overlord;
check(!!OV && OV.hp === 320, '毁灭魔龙血量 320（原 400 ×0.8）');
check(OV.dmg === 4, '毁灭魔龙本体伤害 4（BOSS 不参与 ×1.5）');
check(OV.flying === true, '毁灭魔龙是飞行单位');
check(OV.moveSpeed === 0.75, '毁灭魔龙移速 = 剑士 × 0.75 = 0.75');
check(OV.bombRaid && OV.bombRadius === 2 && OV.bombDmg === 20
  && OV.bombWarn === 3 && OV.bombCd === 10,
  '轰炸技能：半径 2 格 / 伤害 20 / 预警 3 秒 / 冷却 10 秒');
check(X.LEVEL_CONFIGS[3].waves[5].list.includes('overlord'), '第三关 R5 出现毁灭魔龙');

const WL = X.BASE.warlord;
check(WL.hp === 270 && WL.dmg === 7.875 && WL.range === 3.75,
  `攻城领主数值（血 ${WL.hp} / 伤 ${WL.dmg} / 距 ${WL.range}）`);
check(WL.stompDmg === 8, '攻城领主践踏伤害 = 8（技能伤害不随 ×1.5）');

/* 轰炸预警与爆炸：用真实的 bombRadius（2 格）验证波及范围 */
newGameSkip(1);
X.holdTimers(true);
X.G.turnPhase = 'action';
const victim = X.makeUnit('swordsman', 'player', { c:5, r:6 });   // 爆心（距离 0）
victim.hp = victim.hpMax = 200;
const near = X.makeUnit('archer', 'player', { c:6, r:6 });        // 距离 1 格 → 圈内
near.hp = near.hpMax = 200;
const edge = X.makeUnit('archer', 'player', { c:7, r:6 });        // 距离 2 格 → 边界，圈内
edge.hp = edge.hpMax = 200;
const outside = X.makeUnit('archer', 'player', { c:8, r:6 });     // 距离 3 格 → 圈外
outside.hp = outside.hpMax = 200;
X.G.units.push(victim, near, edge, outside);
X.G.bombWarnings.push({ c:5, r:6, timer:3, total:3, dmg:20,
  radius:X.BASE.overlord.bombRadius });
const svHp = victim.hp, nrHp = near.hp, egHp = edge.hp, outHp = outside.hp;
X.update(3.1);   // 预警 3 秒到期 → 爆炸
check(victim.hp === svHp - 20, `爆心单位受 20 伤（${svHp}→${victim.hp}）`);
check(near.hp === nrHp - 20, `距爆心 1 格单位受 20 伤（${nrHp}→${near.hp}）`);
check(edge.hp === egHp - 20, `距爆心 2 格（边界）单位受 20 伤（${egHp}→${edge.hp}）`);
check(outside.hp === outHp, `距爆心 3 格（半径 2 格外）单位不受波及（${outHp}→${outside.hp}）`);
check(X.G.bombWarnings.length === 0, '爆炸后预警清除');

/* 践踏用 stompDmg（8） */
const stomper = X.makeUnit('warlord', 'enemy', { c:5, r:6 });
const victim2 = X.makeUnit('archer', 'player', { c:6, r:6 });
X.G.units.push(stomper, victim2);
const v2hp = victim2.hp;
stomper.stompCd = 0;
X.update(0.05);
check(victim2.hp === v2hp - 8, `强化践踏造成 8 伤（${v2hp}→${victim2.hp}）`);

/* ============================================================ */
section('6.10 敌方全体数值 ×1.5（BOSS 毁灭魔龙除外）');
/* 期望表：除 BOSS 外的所有敌对单位，血量与伤害 = 原值 ×1.5 */
const ENEMY_EXPECT = {
  monster: { hp:30,    dmg:1.5   },
  boss:    { hp:75,    dmg:3.75  },
  flyer:   { hp:24,    dmg:1.8   },
  sapper:  { hp:27,    dmg:1.8   },
  ram:     { hp:60,    dmg:4.5   },   // 攻城槌削了一半血（原 120）
  shaman:  { hp:33,    dmg:1.5   },
  wolf:    { hp:21,    dmg:2.25  },
  warlord: { hp:270,   dmg:7.875 },
};
let enemyOk = 0;
for(const [id, exp] of Object.entries(ENEMY_EXPECT)){
  const t = X.BASE[id];
  if(t && t.hp === exp.hp && t.dmg === exp.dmg) enemyOk++;
  else log(`  ✗ ${id}: hp=${t && t.hp} (期望 ${exp.hp}) / dmg=${t && t.dmg} (期望 ${exp.dmg})`);
}
check(enemyOk === Object.keys(ENEMY_EXPECT).length,
  `全部 ${Object.keys(ENEMY_EXPECT).length} 种非 BOSS 敌人 血量与伤害 = 原值 ×1.5`);

/* 攻速 / 移速 / 攻击距离 不参与缩放（保持原样） */
check(X.BASE.monster.moveSpeed === 1 && X.BASE.wolf.moveSpeed === 2.2,
  '移速不受 ×1.5 影响（狼骑仍 2.2 格/秒）');
check(X.BASE.shaman.range === 5 && X.BASE.warlord.range === 3.75,
  '攻击距离不受 ×1.5 影响（萨满 5 / 领主 3.75）');
check(X.BASE.monster.atkRate === 1 && X.BASE.wolf.atkRate === 1.2,
  '攻速不受 ×1.5 影响');

/* BOSS（毁灭魔龙）单独处理：血量 ×0.8、技能伤害 20 */
check(X.BASE.overlord.hp === 320, '毁灭魔龙血量 = 400 ×0.8 = 320');
check(X.BASE.overlord.bombDmg === 20, '毁灭魔龙技能（轰炸）伤害 = 20');
check(X.BASE.overlord.dmg === 4 && X.BASE.overlord.moveSpeed === 0.75,
  '毁灭魔龙本体伤害/移速保持原样（BOSS 不走 ×1.5）');

/* 运行时校验：新造实例继承新数值 */
newGameSkip(1);
X.G.turnPhase = 'action';
const mobInst = X.makeUnit('monster', 'enemy', { c:16, r:4 });
check(mobInst.hpMax === 30 && mobInst.dmg === 1.5,
  `小怪实例 hpMax=30 / dmg=1.5（实际 ${mobInst.hpMax}/${mobInst.dmg}）`);
const ovInst = X.makeUnit('overlord', 'enemy', { c:16, r:4 });
check(ovInst.hpMax === 320 && ovInst.bombDmg === 20,
  `毁灭魔龙实例 hpMax=320 / bombDmg=20（实际 ${ovInst.hpMax}/${ovInst.bombDmg}）`);

/* ============================================================ */
section('6.11 敌军狂暴事件（本回合敌方移速 ×1.5）+ 事件模态暂停战场');

/* --- 移速倍率：直接驱动 moveAlongPath，对比有无 buff 的位移 --- */
newGameSkip(1);
X.G.turnPhase = 'action';
X.G.enemySpeedMul = 1;
const runner = X.makeUnit('monster', 'enemy', { c:2, r:6 });
function driveOneSecond(u){
  u.path = [{ c:12, r:u.r }]; u.pathIdx = 0; u.repathCd = 999; u.deployed = false;
  const x0 = u.x;
  X.moveAlongPath(u, 1);
  return u.x - x0;
}
const dNorm = driveOneSecond(runner);
X.NEG_EVENTS.monster_buff.apply();
check(X.G.enemySpeedMul === 1.5, '「敌军狂暴」→ 本回合敌方移速倍率 = 1.5');
runner.c = 2; runner.r = 6; runner.x = X.tileCenter(2,6).x; runner.y = X.tileCenter(2,6).y;
const dBuff = driveOneSecond(runner);
check(Math.abs(dBuff - dNorm*1.5) < 0.6,
  `敌方移速 ×1.5 生效（1 秒位移 ${dNorm.toFixed(1)} → ${dBuff.toFixed(1)} 像素）`);

/* 我方单位不受该事件影响 */
const pA = X.makeUnit('swordsman', 'player', { c:2, r:8 });
const pD1 = driveOneSecond(pA);
X.G.enemySpeedMul = 1;
const pB = X.makeUnit('swordsman', 'player', { c:2, r:9 });
const pD2 = driveOneSecond(pB);
check(Math.abs(pD1 - pD2) < 0.01, '敌军狂暴不影响我方单位移速');

/* 新回合开始 → 倍率重置 */
X.G.enemySpeedMul = 1.5;
X.holdTimers(true);
/* 负面事件现在直接生效，抽到「敌军狂暴」会把倍率又顶回 1.5 → 这里临时禁用它，断言重置本身 */
const origBuffApply = X.NEG_EVENTS.monster_buff.apply;
X.NEG_EVENTS.monster_buff.apply = function(){};
X.startRound(2);
X.holdTimers(false); passNeg();
X.NEG_EVENTS.monster_buff.apply = origBuffApply;
check(X.G.enemySpeedMul === 1, '进入新回合时敌方移速倍率重置为 1');

/* --- 事件模态打开 → 战场暂停 --- */
newGameSkip(1);
X.G.turnPhase = 'event';
X.G.triggerQueue = [];
X.G.choiceOpen = false;
const gt0 = X.gameTime;
const opened = X.openNegModal(['base_dmg', 'lose_gold']);
check(opened === true, '负面事件模态可正常打开');
check(X.G.choiceOpen === true, '模态打开 → choiceOpen = true（战场暂停）');
X.update(1);
check(X.gameTime === gt0, '模态打开期间战场暂停（游戏时间不推进）');
X.closeNegModal();
check(X.G.choiceOpen === false, '关闭模态 → choiceOpen = false');
X.update(0.5);
check(X.gameTime > gt0, '关闭模态后战场恢复推进');

/* resolve 系列自动关闭模态（解除暂停） */
X.G.triggerQueue = [];
X.G.choiceOpen = true;
X.resolveNegEvent('lose_gold');
check(X.G.choiceOpen === false, 'resolveNegEvent 自动关闭模态（解除暂停）');

/* ============================================================ */
section('6.12 我方远程数值削弱 + 枪炮手射程 5 + 指挥权（敌方阶段可 / 事件阶段不可）');

/* ---- 血量 ×0.8 / 伤害 ×0.75（只作用于我方远程：弓箭手 / 枪炮手）---- */
check(X.BASE.archer.hp === 12 && X.BASE.archer.dmg === 0.95,
  `弓箭手 hp 12 / dmg 0.95（实际 ${X.BASE.archer.hp}/${X.BASE.archer.dmg}）`);
check(X.BASE.gunner.hp === 14.4 && X.BASE.gunner.dmg === 1.875,
  `枪炮手 hp 18×0.8=14.4 / dmg 2.5×0.75=1.875（实际 ${X.BASE.gunner.hp}/${X.BASE.gunner.dmg}）`);
check(X.BASE.archer.range === 6, '弓箭手射程不变（仍 6 格）');
check(X.BASE.gunner.range === 5, '枪炮手攻击距离为 5 格');
check(X.BASE.archer.atkRate === 0.8 && X.BASE.archer.moveSpeed === 0.8
  && X.BASE.gunner.atkRate === 0.5 && X.BASE.gunner.moveSpeed === 0.6,
  '远程兵攻速不变；弓箭手移速已提到 0.8');
check(X.BASE.swordsman.hp === 22 && X.BASE.swordsman.dmg === 1.1,
  '剑士上调为 22 血 / 1.1 攻');
/* 敌方远程（萨满）不参与本次削弱 */
check(X.BASE.shaman.hp === 33 && X.BASE.shaman.dmg === 1.5,
  '敌方远程【萨满】不受影响（仍 33 / 1.5）');

const arInst = X.makeUnit('archer', 'player', { c: 3, r: 6 });
const gunInst = X.makeUnit('gunner', 'player', { c: 3, r: 7 });
check(arInst.hpMax === 12, `弓箭手实例生命 12（实际 ${arInst.hpMax}）`);
check(gunInst.hpMax === 14.4, `枪炮手实例生命 14.4（实际 ${gunInst.hpMax}）`);

/* ---- 射程行为：5 格内开火 / 6 格不开火 ---- */
newGameSkip(1);
X.G.units.length = 0;
X.G.turnPhase = 'action';
const gunA = X.makeUnit('gunner', 'player', { c: 2, r: 6 });
gunA.moveSpeed = 0;                              // 冻结自身移动，只考察射程
const inR = X.makeUnit('monster', 'enemy', { c: 7, r: 6 });   // 5 格 = 射程边缘
inR.moveSpeed = 0;
X.G.units.push(gunA, inR);
const inRHp0 = inR.hp;
for(let i=0;i<180;i++) X.update(1/60);
check(inR.hp < inRHp0, `枪炮手 5 格内可开火（${inRHp0} → ${inR.hp}）`);

/* 换场景必须重新 newGame：否则上一场景的弹道仍在飞，
   命中上个目标时会被溅射波及本次的敌人，污染断言 */
newGameSkip(1);
X.G.units.length = 0;
X.G.turnPhase = 'action';
const gunB = X.makeUnit('gunner', 'player', { c: 2, r: 6 });
gunB.moveSpeed = 0;
const outR = X.makeUnit('monster', 'enemy', { c: 8, r: 6 }); // 6 格 > 5 格射程
outR.moveSpeed = 0;
X.G.units.push(gunB, outR);
const outRHp0 = outR.hp;
for(let i=0;i<180;i++) X.update(1/60);
check(outR.hp === outRHp0, `超出 5 格时枪炮手不开火（${outRHp0} → ${outR.hp}）`);

/* ---- 士兵介绍：所有介绍位都必须写明攻击距离 ---- */
check(typeof X.unitStatLine === 'function', '存在统一的士兵属性简介函数 unitStatLine');
check(/攻击距离 1 格/.test(X.unitStatLine(X.BASE.swordsman)),
  `剑士介绍含攻击距离（"${X.unitStatLine(X.BASE.swordsman)}"）`);
check(/攻击距离 6 格/.test(X.unitStatLine(X.BASE.archer)),
  `弓箭手介绍含攻击距离（"${X.unitStatLine(X.BASE.archer)}"）`);
check(/攻击距离 5 格/.test(X.unitStatLine(X.BASE.gunner)),
  `枪炮手介绍含攻击距离（"${X.unitStatLine(X.BASE.gunner)}"）`);
check(/攻击距离 1 格/.test(X.unitStatLine(X.BASE.shield)),
  `盾卫介绍含攻击距离（"${X.unitStatLine(X.BASE.shield)}"）`);
check(/无攻击/.test(X.unitStatLine(X.BASE.miner)),
  `矿工介绍标注无攻击（"${X.unitStatLine(X.BASE.miner)}"）`);
/* 介绍里的数值随卡牌等级同步放大（与 applyLevel 的倍率一致） */
check(/攻击距离 9 格/.test(X.unitStatLine(X.BASE.archer, 1.5)),
  `Lv2 弓箭手介绍同步为 9 格（"${X.unitStatLine(X.BASE.archer, 1.5)}"）`);

/* ---- 指挥权：敌方阶段必须还能指挥士兵（魔龙轰炸预警要撤兵）---- */
newGameSkip(3);
X.G.units.length = 0;
const cd1 = X.makeUnit('swordsman', 'player', { c: 5, r: 6 });
X.G.units.push(cd1);
X.G.turnPhase = 'enemy';
X.G.selectedUnit = null;
X.selectUnit(cd1);
check(X.G.selectedUnit === cd1.uid, '敌方阶段可以选中自己的士兵');
X.commandMove(cd1, 3, 6);
check(cd1.moving === true && cd1.manualOrder === true, '敌方阶段可以下达移动命令');
check(!!cd1.path && cd1.path.length > 0, '移动路径已成功生成');

/* 事件阶段（选事件 / 出怪结算）规则保持原样：禁止指挥 */
newGameSkip(3);
X.G.units.length = 0;
const cd2 = X.makeUnit('swordsman', 'player', { c: 5, r: 6 });
X.G.units.push(cd2);
X.G.turnPhase = 'event';
X.G.choiceOpen = false;
X.G.selectedUnit = null;
X.selectUnit(cd2);
check(X.G.selectedUnit === null, '事件阶段仍然不能选中士兵（规则未变）');
X.commandMove(cd2, 3, 6);
check(cd2.moving !== true, '事件阶段仍然不能下达移动命令');
check(X.canCommandUnit() === false, 'canCommandUnit 在事件阶段返回 false');

/* 模态弹窗打开（战场真正暂停）时同样禁止 */
X.G.choiceOpen = true;
check(X.canCommandUnit() === false, '模态打开（战场暂停）时禁止指挥');
X.G.selectedUnit = null;
X.selectUnit(cd2);
check(X.G.selectedUnit === null, '模态打开时点击士兵不会被选中');
X.G.choiceOpen = false;

/* 行动阶段照常可指挥（回归） */
newGameSkip(3);
X.G.units.length = 0;
const cd3 = X.makeUnit('swordsman', 'player', { c: 5, r: 6 });
X.G.units.push(cd3);
X.G.turnPhase = 'action';
X.G.selectedUnit = null;
X.selectUnit(cd3);
check(X.G.selectedUnit === cd3.uid && X.canCommandUnit() === true,
  '行动阶段照常可以指挥（回归）');

/* ---- 飞行单位不占用地面格 ---- */
newGameSkip(3);
X.G.units.length = 0;
const mv = X.makeUnit('swordsman', 'player', { c: 5, r: 6 });
const drg2 = X.makeUnit('overlord', 'enemy', { c: 6, r: 6 });
X.G.units.push(mv, drg2);
check(X.occupiedAt(6, 6) === true, '默认判定：飞行单位所在格仍算占用（召唤落点等场景保持原样）');
check(X.occupiedAt(6, 6, false, { ignoreFlying: true }) === false,
  '移动落点判定忽略飞行单位（魔龙贴脸也能撤到它脚下那一格）');
X.G.turnPhase = 'enemy';
X.G.selectedUnit = null;
X.selectUnit(mv);
X.commandMove(mv, 6, 6);
check(mv.moving === true, '可以下令移动到被飞行单位占据的格子（魔龙不挡路）');

/* ============================================================ */
section('6.13 魔龙回合：出怪结算后进入敌方阶段 + 可撤兵（bug 回归）');

/* 复现路径：第三关 R5 波次含 毁灭魔龙 + 攻城领主，两者都会触发登场演出。
   修复前：出怪结算完成后阶段切到 enemy，但 selectUnit/commandMove 只放行
   action → 整个魔龙回合都点不动士兵，连轰炸预警圈都撤不出去。 */
newGameSkip(3);
X.G.units.length = 0;
X.G.round = 5;
const sol = X.makeUnit('swordsman', 'player', { c: 5, r: 6 });
X.G.units.push(sol);
X.G.turnPhase = 'action';
X.G.pendingSpawns = [{ type:'spawn', lane:'lower',
  list: X.LEVEL_CONFIGS[3].waves[5].list.slice() }];

X.holdTimers(true);            // 暂时冻结 900ms 出怪间隔，逐段观察阶段流转
X.endTurn();
check(X.G.turnPhase === 'event', '出怪阶段：回合停在事件阶段');
check(X.G.units.filter(u => u.side==='enemy' && u.alive).length === 7,
  `R5 波次 7 只敌人全部登场（实际 ${X.G.units.filter(u => u.side==='enemy').length}）`);
check(X.G.introFreeze > 0, '毁灭魔龙 / 攻城领主触发登场演出（战场短暂定格）');

X.holdTimers(false);           // 放行出怪结算
check(X.G.turnPhase === 'enemy',
  '出怪结算完成后自动进入敌方阶段（魔龙回合不再卡在事件阶段）');
check(X.canCommandUnit() === true, '魔龙回合（敌方阶段）canCommandUnit 返回 true');

X.G.selectedUnit = null;
X.selectUnit(sol);
check(X.G.selectedUnit === sol.uid, '魔龙回合可以选中自己的士兵');
X.commandMove(sol, 3, 6);
check(sol.moving === true && !!sol.path && sol.path.length > 0,
  '魔龙回合可以下令撤兵（赶在定点轰炸前撤离）');

/* 演出结束后战场恢复推进 → 撤兵指令真实生效 */
X.clearUnitIntro();
X.G.turnPhase = 'enemy';
sol.moveSpeed = 1;             // 放大步速，10 秒内必定走完两格
const startCol = sol.c;
for(let i=0;i<600;i++) X.update(1/60);
check(sol.c < startCol, `撤兵指令真实生效（列 ${startCol} → ${sol.c}）`);

/* ============================================================ */
section('6.14 战场倍速 + 弹窗 DOM 残留清理');

/* ---- 弹窗 DOM 残留（实拍 bug：援军弹窗里叠着上局的结算按钮和旧事件选项）---- */
check(typeof X.resetOverlayForModal === 'function', '存在统一的弹窗清理函数 resetOverlayForModal');
/* 模拟上一局胜利后残留的「进入下一关 / 重打本关」按钮与旧的负面事件选项 */
global.document.getElementById('overlay-next').style.display = '';
global.document.getElementById('overlay-retry').style.display = '';
let removedStaleWrap = false;
const realGEBI = global.document.getElementById;
global.document.getElementById = (id) => {
  if(id === 'neg-choices') return { remove(){ removedStaleWrap = true; } };
  return realGEBI(id);
};
X.resetOverlayForModal();
global.document.getElementById = realGEBI;
check(removedStaleWrap, '清理时移除残留的事件选项容器（neg-choices）');
check(global.document.getElementById('overlay-next').style.display === 'none',
  '清理后隐藏残留的「进入下一关」按钮');
check(global.document.getElementById('overlay-retry').style.display === 'none',
  '清理后隐藏残留的「重打本关」按钮');

/* 端到端：新一局开局的援军弹窗必须不带任何上局痕迹 */
newGameSkip(1);
global.document.getElementById('overlay-next').style.display = '';
global.document.getElementById('overlay-retry').style.display = '';
const rewardOpened = X.openRewardModal(['swordsman','archer','miner']);
check(rewardOpened === true, '援军奖励弹窗可以打开');
check(global.document.getElementById('overlay-next').style.display === 'none'
  && global.document.getElementById('overlay-retry').style.display === 'none',
  '打开援军弹窗时自动清掉上局残留的结算按钮');
X.closeRewardModal();

/* ---- 战场倍速 ---- */
check(X.GAME_SPEED_get() === 1, '默认战场倍速 ×1');
check(typeof X.stepFrame === 'function', '存在倍速感知的每帧入口 stepFrame');

/* 行为级：同一段 6 格直线路径，二倍速的推进距离应约为常速的 2 倍。
   直接注入路径而非 commandMove —— 避免关卡地形 / 基地占位 / 自动前压等干扰，
   让用例只考察「倍速 → 推进速度」这一个变量。 */
function runDist(speed){
  newGameSkip(3);
  X.G.units.length = 0;
  X.G.turnPhase = 'action';
  const u = X.makeUnit('swordsman', 'player', { c: 8, r: 6 });
  u.moveSpeed = 1;
  u.path = [7, 6, 5, 4, 3, 2].map(c => ({ c, r: 6 }));
  u.pathIdx = 0;
  u.moving = true;
  u.manualOrder = true;      // 玩家命令：禁用自动前压
  u.deployed = true;
  X.G.units.push(u);
  X.setGameSpeed(speed);
  for(let i=0;i<120;i++) X.stepFrame(1/60);
  X.setGameSpeed(1);
  return 8 - u.c;
}
const d1 = runDist(1), d2 = runDist(2);
check(d2 > d1 * 1.7 && d2 < d1 * 2.3,
  `二倍速推进距离 ≈ 2 倍（常速 120 帧走 ${d1} 格 → 二倍速走 ${d2} 格）`);

X.setGameSpeed(2);
check(X.GAME_SPEED_get() === 2, 'setGameSpeed(2) → ×2');
check(global.localStorage.getItem(X.SPEED_KEY) === '2', '倍速偏好写入 localStorage');
X.toggleGameSpeed();
check(X.GAME_SPEED_get() === 1, 'toggleGameSpeed：×2 → ×1');
X.toggleGameSpeed();
check(X.GAME_SPEED_get() === 2, 'toggleGameSpeed：×1 → ×2');
X.setGameSpeed(1);
check(X.GAME_SPEED_get() === 1, '恢复默认 ×1（不影响后续用例）');

/* ============================================================ */
section('6.15 魔龙不炸基地 + 攻击距离升级线性 + 出怪口预告');

/* ---- ① 轰炸不伤基地：把爆心放在基地旁边（基地在半径 2 格内）---- */
newGameSkip(3);
X.holdTimers(true);
X.G.units.length = 0;
X.G.turnPhase = 'action';
const baseHp0 = X.G.baseHp;
const blastVictim = X.makeUnit('swordsman', 'player', { c: 3, r: 6 });   // 爆心（基地 (1,6) 距此 2 格）
blastVictim.hp = blastVictim.hpMax = 200;
X.G.units.push(blastVictim);
/* 前置：基地确实落在这次轰炸的半径内（否则这条用例根本没验证到东西） */
check(Math.hypot(3 - X.BASE_TILE.c, 6 - X.BASE_TILE.r) <= X.BASE.overlord.bombRadius,
  '（前置）基地落在本次轰炸半径内（基地距爆心 2 格 = 半径边缘）');
X.G.bombWarnings.push({ c:3, r:6, timer:3, total:3, dmg:20,
  radius:X.BASE.overlord.bombRadius });
const bvHp0 = blastVictim.hp;
X.update(3.1);
check(blastVictim.hp === bvHp0 - 20, `圈内我方单位照常受 20 伤（${bvHp0}→${blastVictim.hp}）`);
check(X.G.baseHp === baseHp0,
  `基地落在轰炸半径内也毫发无损（基地 ${baseHp0} → ${X.G.baseHp}）`);

/* ---- ② 魔龙不会把基地选为轰炸目标 ---- */
newGameSkip(3);
X.holdTimers(true);
X.G.units.length = 0;
X.G.turnPhase = 'enemy';
const dragon = X.makeUnit('overlord', 'enemy', { c: 6, r: 6 });
dragon.bombCd = 0;
X.G.units.push(dragon);
X.update(1/60);
check(X.G.bombWarnings.length === 0,
  '场上没有我方单位时，魔龙不会拿基地凑数放轰炸（基地不在候选内）');
const lone = X.makeUnit('miner', 'player', { c: 9, r: 6 });
X.G.units.push(lone);
dragon.bombCd = 0;
X.update(1/60);
check(X.G.bombWarnings.length === 1 &&
  X.G.bombWarnings[0].c === 9 && X.G.bombWarnings[0].r === 6,
  '有单位时正常释放轰炸，且落点 = 该单位所在格（不是基地）');
check(dragon.bombCd === dragon.bombCdMax,
  `放完轰炸后进入冷却（${dragon.bombCd} 秒）`);
X.G.bombWarnings.length = 0;

/* ---- ③ 攻击距离：升级倍率改为线性（每级 +0.5 倍）---- */
check(X.RANGE_UPGRADE_STEP === 0.5, '攻击距离升级步长 = 0.5 倍');
check(X.rangeUpgradeMul(1) === 1 && X.rangeUpgradeMul(2) === 1.5
  && X.rangeUpgradeMul(3) === 2,
  `攻击距离升级倍率：Lv1 ×1 / Lv2 ×1.5 / Lv3 ×2（实际 `
  + `${X.rangeUpgradeMul(1)} / ${X.rangeUpgradeMul(2)} / ${X.rangeUpgradeMul(3)}）`);

newGameSkip(2);
X.G.units.length = 0;
function rangeAt(cardId, lv){
  if(!X.G.cards[cardId]) X.G.cards[cardId] = { lv:1, summonCountThisTurn:0 };
  X.G.cards[cardId].lv = lv;
  const u = X.makeUnit(cardId, 'player', { c: 3, r: 9 });
  u.lv = lv;
  X.applyLevel(u);
  return u;
}
const a2 = rangeAt('archer', 2);
check(a2.range === 9, `弓箭手 Lv2 射程 6 ×1.5 = 9 格（实际 ${a2.range}）`);
const a3 = rangeAt('archer', 3);
check(a3.range === 12, `弓箭手 Lv3 射程 6 ×2 = 12 格（复利旧口径会是 13.5，实际 ${a3.range}）`);
const g3 = rangeAt('gunner', 3);
check(g3.range === 10, `枪炮手 Lv3 射程 5 ×2 = 10 格（实际 ${g3.range}）`);
const s3 = rangeAt('swordsman', 3);
check(s3.range === 2, `剑士 Lv3 射程 1 ×2 = 2 格（实际 ${s3.range}）`);
/* 血 / 伤 / 攻速 仍走原来的 ×1.5 复利，只有距离变了 */
check(a3.hpMax === Math.round(X.BASE.archer.hp * Math.pow(X.UPGRADE_MULT, 2))
  && a3.atkRate === +(X.BASE.archer.atkRate * Math.pow(X.UPGRADE_MULT, 2)).toFixed(3),
  `血 / 攻速仍按每级 ×1.5 复利（Lv3 弓箭手 ${a3.hpMax} 血 / 攻速 ${a3.atkRate}）`);
/* 介绍文案同步 */
check(/攻击距离 12 格/.test(X.unitStatLine(X.BASE.archer,
  Math.pow(X.UPGRADE_MULT, 2), X.rangeUpgradeMul(3))),
  `介绍按新口径显示攻击距离（"${X.unitStatLine(X.BASE.archer, Math.pow(X.UPGRADE_MULT, 2), X.rangeUpgradeMul(3))}"）`);

/* ---- ④ 出怪口出怪预告 ---- */
newGameSkip(2);
X.holdTimers(true);
X.startRound(3);                     // 第二关 R3：上 2 小怪 / 下 2 小怪 + 萨满
const pv3 = X.G.spawnPreview;
check(pv3.upper.has && pv3.upper.queue.join(',') === 'monster,monster',
  `预告·上路 = 2 只小怪（${pv3.upper.queue.join('+')}）`);
check(pv3.lower.has && pv3.lower.queue.join(',') === 'monster,monster,shaman',
  `预告·下路 = 2 小怪 + 萨满（${pv3.lower.queue.join('+')}）`);
check(!pv3.upper.done && !pv3.lower.done, '未出怪前标记为「待出」');
const rem3 = X.spawnPreviewRemain('lower');
check(rem3.find(r => r.typeId === 'monster').count === 2
  && rem3.find(r => r.typeId === 'shaman').count === 1,
  '预告按类型聚合数量（小怪 ×2、萨满 ×1）');
check(rem3[0].emoji === X.BASE.monster.emoji, `预告带图标（${rem3[0].emoji}）`);

/* 真实出怪链路：runEvent('spawn') → 预告同步扣减 */
X.G.turnPhase = 'event';
X.runEvent({ type:'spawn', lane:'upper', list:['monster','monster'] });
check(X.G.spawnPreview.upper.queue.length === 0 && X.G.spawnPreview.upper.done,
  '上路出完 → 预告清空并标记「已出完」');
check(!X.G.spawnPreview.lower.done && X.G.spawnPreview.lower.queue.length === 3,
  '下路还没出 → 预告保留 3 只未出');
X.runEvent({ type:'spawn', lane:'lower', list:['monster','monster','shaman'] });
check(X.G.spawnPreview.lower.done && X.spawnPreviewRemain('lower').length === 0,
  '下路出完 → 同样标记「已出完」');

/* 单路关（第一关）×2 出怪：预告数量与倍率一致 */
newGameSkip(1);
X.holdTimers(true);
X.startRound(2);
const pvL1 = X.G.spawnPreview;
const w2 = X.LEVEL_CONFIGS[1].waves[2];
check(pvL1.lower.has && !pvL1.upper.has, '第一关只登记「下路」出怪口');
check(pvL1.lower.queue.length === w2.list.length * (X.LEVEL_CONFIGS[1].spawnMul || 1),
  `预告与「两倍出怪」一致（${w2.list.length} 只 ×2 = ${pvL1.lower.queue.length} 只）`);

/* 新回合重置预告 */
newGameSkip(2);
X.holdTimers(true);
X.startRound(5);                     // R5：上路 3 只 / 下路 5 只
check(X.G.spawnPreview.upper.queue.length === 3
  && X.G.spawnPreview.lower.queue.length === 5,
  '新回合预告按当回合波次重建（上 3 / 下 5）');

/* 存档携带出怪预告 */
newGameSkip(2);
X.holdTimers(true);
X.startRound(4);
X.G.turnPhase = 'action';
X.saveGame();
const savedPv = JSON.parse(global.localStorage.getItem(X.BATTLE_SAVE_KEY) || 'null');
check(savedPv && savedPv.spawnPreview
  && savedPv.spawnPreview.upper.queue.join(',') === 'sapper,monster,monster',
  '存档携带出怪预告（上路 破坏者 + 2 小怪）');
X.clearBattleSave();

/* ============================================================ */
section('6.16 提示条生命周期（#banner）与移动端适配');

/* —— 计时单位必须是"秒" ——
   历史 bug：bannerTimer 被写成 2000（毫秒），而每帧减的是 dt（秒），
   于是提示条要挂 2000 秒（33 分钟）才消失 = 永久挡在战场上；
   移动端小屏下它既遮战场又吃掉点击，表现成"行动阶段提示栏不消失、无法操作"。 */
check(X.BANNER_SHOW_SEC > 0 && X.BANNER_SHOW_SEC <= 5,
  `横幅时长是秒级（${X.BANNER_SHOW_SEC}s），不是毫秒`);

newGameSkip(1);
X.holdTimers(true);
X.G.turnPhase = 'action';
X.showBanner('第 1 回合 · 行动阶段', 'pos');
check(X.G.bannerTimer <= 5,
  `showBanner 后倒计时 ≈ ${X.G.bannerTimer}s（原实现误写成 2000）`);

/* 隔离验证 tickBanner：以 0.1s 步长推进，看它到底多久消失 */
X.showBanner('计时验证', 'pos');
let bannerElapsed = 0;
while (X.G.banner && bannerElapsed < 10) { X.tickBanner(0.1); bannerElapsed = +(bannerElapsed + 0.1).toFixed(1); }
check(X.G.banner === null, `横幅确实会消失（用时 ${bannerElapsed.toFixed(1)}s）`);
check(Math.abs(bannerElapsed - X.BANNER_SHOW_SEC) <= 0.2,
  `消失时刻与配置一致（${bannerElapsed.toFixed(1)}s ≈ 配置 ${X.BANNER_SHOW_SEC}s）`);

/* stepFrame 已接线：每帧入口会老化提示条 */
X.showBanner('接线检查', 'pos');
X.stepFrame(1 / 60);
check(X.G.bannerTimer < X.BANNER_SHOW_SEC, 'stepFrame 每帧都会老化提示条（已接线）');

/* 战场暂停（事件模态打开）时提示条照样消失 —— 不能被"冻"在屏幕上 */
X.showBanner('暂停期间也不该留', 'neg');
X.G.choiceOpen = true;
for (let i = 0; i < Math.ceil((X.BANNER_SHOW_SEC + 0.5) * 60); i++) X.stepFrame(1 / 60);
check(X.G.banner === null, '事件模态暂停战场时，提示条仍然按时消失');
X.G.choiceOpen = false;

/* 倍速不影响提示条寿命：它是 UI 计时，按真实秒走 */
X.setGameSpeed(2);
X.showBanner('倍速检查', 'pos');
X.stepFrame(0.05);
const bannerAt2x = X.G.bannerTimer;
X.setGameSpeed(1);
X.showBanner('常速检查', 'pos');
X.stepFrame(0.05);
check(bannerAt2x === X.G.bannerTimer,
  `×2 倍速不会让提示条更快消失（${bannerAt2x.toFixed(2)} vs ${X.G.bannerTimer.toFixed(2)}）`);

/* 拦截型 toast 用更短时长，避免长时间遮挡视线 */
check(X.TOAST_SHOW_SEC < X.BANNER_SHOW_SEC,
  `toast 时长（${X.TOAST_SHOW_SEC}s）短于常规横幅（${X.BANNER_SHOW_SEC}s）`);
X.toast('不可操作');
check(X.G.bannerTimer === X.TOAST_SHOW_SEC, 'toast 使用较短的显示时长');

/* —— 静态资源断言：移动端适配的关键 CSS —— */
const cssSrc = fs.readFileSync('style.css', 'utf8');
const bannerRule = (cssSrc.match(/#banner\{[^}]*\}/) || [''])[0];
check(/pointer-events\s*:\s*none/.test(bannerRule),
  '#banner 设了 pointer-events:none —— 提示条不再吃掉战场上的点击');
const boardRule = (cssSrc.match(/#board\{[^}]*\}/) || [''])[0];
check(/touch-action\s*:\s*manipulation/.test(boardRule),
  '#board 设了 touch-action:manipulation —— 触屏轻点即时生效、不被双击缩放吞掉');
const rootRule = (cssSrc.match(/#game-root\{[^}]*\}/) || [''])[0];
check(/height\s*:\s*100dvh/.test(rootRule),
  '#game-root 用 100dvh —— 移动端地址栏不会把底部按钮挤出屏幕');
const mainRule = (cssSrc.match(/#main-area\{[^}]*\}/) || [''])[0];
check(/grid-template-rows\s*:\s*minmax\(0\s*,\s*1fr\)/.test(cssSrc),
  '单列布局里战场行用 minmax(0,1fr) —— 不会把侧栏顶出屏幕（手牌/结束回合点不到）');

/* ============================================================ */
section('7. 升级被动');
newGameSkip(2);
X.G.cards.swordsman.lv = 2;
const sw2 = X.makeUnit('swordsman', 'player', { c: 3, r: 6 });
sw2.lv = X.G.cards.swordsman.lv;
X.applyLevel(sw2);
check(!!sw2.pas.shieldwall, '剑士 Lv2 解锁「盾墙」被动');
X.G.cards.swordsman.lv = 3;
sw2.lv = 3; X.applyLevel(sw2);
check(!!sw2.pas.counter, '剑士 Lv3 解锁「反击」被动');
X.G.cards.archer.lv = 3;
const ar3 = X.makeUnit('archer', 'player', { c: 3, r: 7 });
ar3.lv = 3; X.applyLevel(ar3);
check(!!ar3.pas.pierce, '弓箭手 Lv3 解锁「穿透」被动');
X.G.cards.miner.lv = 3;
const mn3 = X.makeUnit('miner', 'player', { c: 3, r: 8 });
mn3.lv = 3; X.applyLevel(mn3);
check(!!mn3.pas.automation, '矿工 Lv3 解锁「自动化」被动');

/* 手牌升级按钮已移除：upgradeCard 变为提示 */
X.G.gold = 100;
const lvBefore = X.G.cards.swordsman.lv;
X.upgradeCard('swordsman');
check(X.G.cards.swordsman.lv === lvBefore, 'upgradeCard 不再直接升级（需去商店）');
check(X.G.gold === 100, 'upgradeCard 不扣金币');

/* ============================================================ */
section('9. 战斗进度存档（保存 / 恢复 / 清除）');
X.clearBattleSave();
check(!X.hasBattleSave(), '初始无存档');

newGameSkip(2);
X.holdTimers(true);
X.startRound(2);
holdTimers(false); passNeg();   // 进入行动阶段
X.G.gold = 123;
const svUnit = X.makeUnit('swordsman', 'player', { c:3, r:6 });
svUnit.hp = 12;
X.G.units.push(svUnit);
X.saveGame();
check(X.hasBattleSave(), 'saveGame 后有存档');

newGameSkip(2);                   // 模拟重开
check(X.G.gold !== 123, 'newGame 后状态已重置');
const okLoad = X.loadGame();
check(okLoad, 'loadGame 恢复成功');
check(X.G.round === 2 && X.G.gold === 123, `恢复回合与金币（R${X.G.round} / ◈${X.G.gold}）`);
check(X.G.turnPhase === 'action' && X.G.phase === 'playing', '恢复到行动阶段');
const loaded = X.G.units.find(u => u.typeId==='swordsman' && u.side==='player');
check(!!loaded && loaded.hp === 12, '恢复场上单位（含受伤血量）');
check(X.G.units.every(u => !u.target), '单位 target 已清空（载入后自动重新索敌）');
check(X.G.lv && X.G.lv.id === 2, '恢复关卡配置引用');

X.clearBattleSave();
check(!X.hasBattleSave(), 'clearBattleSave 清除存档');


/* ---- 负面事件：直接触发、不再二选一；天打雷劈更稀有 ---- */
X.clearBattleSave();
newGameSkip(2);
X.holdTimers(true);
X.G.choiceOpen = false;
X.runEvent({ type:'neg_random' });
check(X.G.choiceOpen === false, '负面事件直接结算，不打开选择弹窗');
holdTimers(false);
{
  let thunder = 0;
  const N = 3000;
  for(let i = 0; i < N; i++) if(X.drawNegEvent() === 'thunder') thunder++;
  const rate = thunder / N;
  check(rate > 0.03 && rate < 0.11, `天打雷劈命中率约 6.5%（实测 ${(rate * 100).toFixed(1)}%）`);
  check(X.NEG_EVENT_WEIGHT.thunder < 1, '天打雷劈权重低于其他负面事件');
}


/* ---- 负面事件必须"看得见"：播报卡 ---- */
newGameSkip(2);
X.hideEventCard();
check(document.getElementById('evcard').className.indexOf('hidden') >= 0, '默认不显示播报卡');
/* 直接调用：卡片立即可见、文案正确、能收起（holdTimers：别让自动隐藏的定时器立刻跑） */
X.holdTimers(true);
X.showEventCard('neg', '天打雷劈', '测试说明文字', 5);
const evCardEl = document.getElementById('evcard');
check(evCardEl.className.indexOf('hidden') < 0, 'showEventCard 后播报卡可见');
check(document.getElementById('evcard-name').textContent === '天打雷劈', '播报卡显示事件名');
check(document.getElementById('evcard-desc').textContent === '测试说明文字', '播报卡显示事件说明');
check(document.getElementById('evcard-tag').textContent === '负面事件', '播报卡标明「负面事件」');
X.hideEventCard();
check(document.getElementById('evcard').className.indexOf('hidden') >= 0, 'hideEventCard 可收起');
X.holdTimers(false);
/* 集成：负面事件结算时确实调用了播报卡 */
X.showEventCard('neg', '占位', '占位', 5);
X.runEvent({ type:'neg_random' });
const evName = document.getElementById('evcard-name').textContent;
check(!!evName && evName !== '占位', `负面事件结算时刷新了播报卡（${evName}）`);

/* ---- 读档不能重放第 1 回合「选援军」 ---- */
X.clearBattleSave();
newGameSkip(2);
X.holdTimers(true); X.startRound(2); holdTimers(false); passNeg();
X.G.gold = 77;
X.saveGame();
newGameSkip(1);                       // 换关，模拟重新打开游戏
check(X.loadGame(), '再次读档成功');
check(X.G.choiceOpen === false, '读档后没有事件弹窗');
check(X.G.triggerQueue.length === 0, '读档后事件队列为空');
check(!X.G.roundEvents.some(e => e.type === 'reward_pick'), '读档后不会重排「选援军」');
check(X.G.gold === 77 && X.G.round === 2, `读档数据正确（R${X.G.round} / ◈${X.G.gold}）`);
X.clearBattleSave();

/* ============================================================ */
section('10. 音效系统');

check(!!X.SFX && typeof X.SFX === 'object', '存在音效模块 SFX');
check(typeof X.SFX.play === 'function', 'SFX.play 可用');
check(typeof X.SFX.unlock === 'function', 'SFX.unlock 可用（首次交互解锁音频）');
check(typeof X.SFX.setMuted === 'function' && typeof X.SFX.isMuted === 'function', '提供静音开关');
check(typeof X.sfx === 'function', '提供全局便捷入口 sfx()');

/* headless 无 AudioContext：所有音效应静默降级，绝不抛错 */
let sfxErr = null;
try{
  ['click','select','summon','place','deny','coin','buy','upgrade','hit','death',
   'baseHit','warn','explode','stomp','event','turn','elite','boss','win','lose']
    .forEach(n => X.sfx(n));
  X.sfx('不存在的音效名');
}catch(e){ sfxErr = e; }
check(sfxErr === null, '无 AudioContext 环境下播发音效静默降级、不抛错');

/* 静音开关写入 localStorage（刷新后保留） */
const beforeMute = X.SFX.isMuted();
X.SFX.setMuted(true);
check(X.SFX.isMuted() === true, 'setMuted(true) → 静音生效');
check(global.localStorage.getItem(X.MUTE_KEY) === '1', '静音状态写入 localStorage（刷新不丢）');
X.SFX.toggle();
check(X.SFX.isMuted() === false, 'toggle() 切回开启');
X.SFX.setMuted(beforeMute);

/* 顶栏音效按钮：已绑定点击处理，反复点击不抛错 */
const soundBtn = global.document.getElementById('btn-sound');
check(typeof soundBtn.onclick === 'function', '顶栏音效按钮已绑定点击处理');
let btnErr = null;
try{ soundBtn.onclick(); soundBtn.onclick(); }catch(e){ btnErr = e; }
check(btnErr === null, '点击音效按钮不抛错（可反复静音 / 开启）');
X.SFX.setMuted(beforeMute);

/* ============================================================ */
section('11. 精英 / BOSS 登场介绍');

check(X.TIER_INFO.elite.label === '精英单位', '精英单位标签正确');
check(X.TIER_INFO.boss.label === 'BOSS 单位', 'BOSS 单位标签正确');
check(X.TIER_INFO.elite.color === '#ffb648' && X.TIER_INFO.boss.color === '#c06cff', '两级徽标配色区分');
check(X.BASE.warlord.tier === 'elite', '攻城领主标记为精英单位（tier = elite）');
check(X.BASE.overlord.tier === 'boss', '毁灭魔龙标记为 BOSS 单位（tier = boss）');
check(X.UNIT_INTRO.warlord.tier === 'elite' && X.UNIT_INTRO.warlord.name === '攻城领主', '攻城领主有登场介绍表（精英）');
check(X.UNIT_INTRO.overlord.tier === 'boss' && X.UNIT_INTRO.overlord.name === '毁灭魔龙', '毁灭魔龙有登场介绍表（BOSS）');
check(Array.isArray(X.UNIT_INTRO.overlord.lines) && X.UNIT_INTRO.overlord.lines.length >= 2, '登场介绍含能力清单');
check(X.UNIT_INTRO.warlord.lines.some(l => l.includes('践踏')), '攻城领主介绍写明践踏技能');
check(X.UNIT_INTRO.overlord.lines.some(l => l.includes('轰炸')), '毁灭魔龙介绍写明定点轰炸');
check(X.INTRO_DUR > 0, '登场演出有时长常量 INTRO_DUR');

/* 出怪事件带 BOSS → 自动排入登场演出（世界定格） */
newGameSkip(3);
X.G.turnPhase = 'action';
X.G.units.length = 0;
X.clearUnitIntro();
X.runEvent({ type:'spawn', lane:'lower', list:['overlord'] });
check(X.G.introFreeze > 0, 'BOSS 出场 → 自动触发登场演出（世界定格启动）');
check(X.G.units.some(u => u.typeId === 'overlord' && u.side === 'enemy'), '毁灭魔龙已进入战场');
check(X.G.triggerQueue.length === 0, '登场演出不会污染事件队列');

/* 演出期间：游戏时间暂停、敌人原地不动 */
X.G.units.length = 0;
const probeU = X.makeUnitOf('monster', 'enemy', { c:16, r:6 });
X.G.units.push(probeU);
const gIntro = X.gameTime;
const probeX = probeU.x, probeY = probeU.y;
X.update(0.3);
check(X.gameTime === gIntro, '演出期间游戏时间暂停（世界定格）');
X.update(0.3);
check(probeU.x === probeX && probeU.y === probeY, '演出期间敌人不会移动（给玩家看清介绍的时间）');

/* 演出走完 → 自动恢复推进 */
for(let i=0;i<12;i++) X.update(0.3);
check(X.G.introFreeze === 0, '演出结束后定格自动解除');
check(X.gameTime > gIntro, '演出结束后游戏时间恢复推进');

/* afterIntro：回合推进等动作被推迟到演出结束 */
let afterFired = false;
X.clearUnitIntro();
X.queueUnitIntro(['warlord']);
X.afterIntro(()=>{ afterFired = true; });
check(!afterFired && X.G.introAfter.length === 1, 'afterIntro 在演出期间挂起回调');
X.update(0.5);
check(!afterFired, '演出未结束时挂起的回调不执行');
for(let i=0;i<12;i++) X.update(0.3);
check(afterFired, '演出结束后挂起的回调被执行');

/* 同波多个 tier 单位 → 排队逐个播 */
X.clearUnitIntro();
X.queueUnitIntro(['overlord','warlord']);
check(X.G.introFreeze > 0 && X.G.introQueue.length === 1, '同波多个精英/BOSS 依次入队（第二个排队等待）');
X.clearUnitIntro();
check(X.G.introFreeze === 0 && X.G.introQueue.length === 0, 'clearUnitIntro 立即清空演出');

/* 普通小怪不触发演出；未知类型安全忽略 */
X.clearUnitIntro();
X.G.units.length = 0;
X.runEvent({ type:'spawn', lane:'lower', list:['monster','monster'] });
check(X.G.introFreeze === 0, '普通小怪出场不触发登场演出');
check(X.queueUnitIntro(['monster','不存在的单位']) === false, '非 tier 单位不会排入演出队列');

/* ============================================================ */
section('13. 第四关：手绘地图 → 网格（岩石 / 高地 / 林地）');
const C4 = X.LEVEL_CONFIGS[4];
check(!!C4, '存在第四关配置');
check(C4.hasTerrain === true && !!C4.terrainMap, '第四关启用关卡专属地形表 terrainMap');
check(X.levelIds().includes(4), '第四关进入关卡列表');
newGameSkip(2);
check(X.terrainAt(13,4) && X.terrainAt(13,4).id === 'hill', '第二关上下文：(13,4) 仍是高地（不受第四关影响）');

newGameSkip(4);
check(X.G.lv.id === 4, '可进入第四关');
/* 岩石（黄）：中央大岩体 / 右上、右下岩体 */
check(X.passable(6,4) === false && X.passable(11,8) === false, '第四关中央大岩体 c6~c11 × r4~r8 → 不可通行');
check(X.passable(10,5) === false, '第四关 (10,5) 中央大岩体 → 不可通行');
check(X.passable(13,0) === false && X.passable(18,2) === false, '第四关右上岩体 c13~c21 × r0~r4 → 不可通行');
check(X.passable(13,12) === false && X.passable(18,9) === false, '第四关右下岩体 c13~c21 × r7~r12 → 不可通行');
check(X.passable(21,4) === false && X.passable(21,7) === false, '第四关右侧一直推到边（c21）');
/* 通道：上路 / 下路 / 中央与右侧之间那条 c12 窄道 */
check(X.passable(5,5) === true, '第四关中央岩体西侧 (5,5) 可通行');
check(X.passable(12,0) === true && X.passable(12,6) === true && X.passable(12,12) === true,
  '第四关 c12 是贯通的竖向窄道（敌人在这里分流上下路）');
check(X.passable(13,5) === true && X.passable(18,5) === true && X.passable(18,6) === true,
  '第四关 r5~r6 右中横廊（出怪点所在走廊）可通行');
check(X.passable(3,2) === true, '第四关基地侧不再有 c3 岩壁（(3,2) 可通行）');
/* 矿场：手绘图下方那个方框 → 2×2，锚点 (7,10) */
check(C4.mine && C4.mine.c === 7 && C4.mine.r === 10, '第四关矿场锚点写在关卡配置里 = (7,10)');
check(X.MINE_TILE.c === 7 && X.MINE_TILE.r === 10, '进入第四关后 MINE_TILE 切到 (7,10)');
check(X.isMineTile(7,10) && X.isMineTile(8,11), '第四关矿场 4 格 = (7~8, 10~11)');
check(X.terrainAt(7,10) === null && X.passable(7,10) === true, '矿场格上无地形、可通行');
/* 高地（红）：伤害 +25% */
check(X.terrainAt(5,2) && X.terrainAt(5,2).id === 'hill', '第四关 (5,2) 高地');
check(X.terrainAt(3,10) && X.terrainAt(3,10).id === 'hill', '第四关 (3,10) 高地');
check(X.terrainAt(5,2).dmgBonus === 0.25, '第四关高地 = 伤害 +25%');
/* 林地（绿）：远程伤害 -40% */
check(X.terrainAt(9,2) && X.terrainAt(9,2).id === 'forest', '第四关 (9,2) 林地');
check(X.terrainAt(5,9) && X.terrainAt(5,9).id === 'forest', '第四关 (5,9) 林地');
check(X.terrainAt(12,10) && X.terrainAt(12,10).id === 'forest', '第四关 (12,10) 林地');
check(X.terrainAt(9,2).rangedReduce === 0.4, '第四关林地 = 远程伤害 -40%');
/* 连通性：出怪走廊 → 基地，上路 / 下路两条绕行路线都要通 */
const pTop = X.aStar({ c:19, r:5 }, { c:2, r:6 });
check(!!pTop && pTop.length > 1, '出怪走廊 → 基地 有通路（经 c12 窄道 + 上路绕行）');
const pBottom = X.aStar({ c:19, r:6 }, { c:2, r:6 });
check(!!pBottom && pBottom.length > 1, '出怪走廊 → 基地 有通路（经 c12 窄道 + 下路绕行）');
check(X.aStar({ c:12, r:2 }, { c:2, r:6 }).length > 1, '上路 → 基地 有通路');
check(X.aStar({ c:12, r:10 }, { c:2, r:6 }).length > 1, '下路（含绕过矿场）→ 基地 有通路');
check(X.passable(19,6) === true, '右侧横廊 (19,6) 可通行（出怪走廊）');

/* ---- 两个出怪口：都设在 c12 窄道口，上口走上路 / 下口走下路 ---- */
check(C4.hasLanes === true, '第四关是双路关（两个出怪口）');
check(C4.spawnUpper && C4.spawnUpper.c === 21 && C4.spawnUpper.r === 5, '第四关上口写在配置里 = (21,5)');
check(C4.spawnLower && C4.spawnLower.c === 21 && C4.spawnLower.r === 6, '第四关下口写在配置里 = (21,6)');
check(X.SPAWN_UPPER.c === 21 && X.SPAWN_UPPER.r === 5, '进入第四关后 SPAWN_UPPER 切到 (21,5)');
check(X.SPAWN_LOWER.c === 21 && X.SPAWN_LOWER.r === 6, '进入第四关后 SPAWN_LOWER 切到 (21,6)');
check(X.SPAWN_SPREAD.r === 0, '第四关刷怪只在左右散（行 ±0），不会串到另一条路');
/* 散布只在走廊本路上（r5 / r6），分流靠「进路口」 */
X.G.units.length = 0;
{
  const upR = [], upC = [], loR = [], loC = [];
  for (let i = 0; i < 300; i++) {
    const t = X.spawnLaneTile('upper', 'monster'); upR.push(t.r); upC.push(t.c);
    const l = X.spawnLaneTile('lower', 'monster'); loR.push(l.r); loC.push(l.c);
  }
  check(upR.every(r => r === 5), '上口落点全部在走廊上排 r5');
  check(loR.every(r => r === 6), '下口落点全部在走廊下排 r6');
  check(Math.min(...upC) >= 18 && Math.max(...upC) === 21, `上口落点都在走廊东段 c18~c21（实际 ${Math.min(...upC)}~${Math.max(...upC)}）`);
}
check(X.passable(21,5) === true && X.passable(21,6) === true, '两个出怪口所在格都可通行');
/* 这张图上下完全对称（两条路一样长），所以靠「进路口」强制分流 */
check(!!C4.laneGate && C4.laneGate.upper.c === 12 && C4.laneGate.upper.r === 4, '第四关上路进路口写在配置里 = (12,4)');
check(!!C4.laneGate && C4.laneGate.lower.c === 12 && C4.laneGate.lower.r === 7, '第四关下路进路口写在配置里 = (12,7)');
{
  const pu = X.aStar(C4.laneGate.upper, X.BASE_TILE);
  const pl = X.aStar(C4.laneGate.lower, X.BASE_TILE);
  check(!!pu && Math.max(...pu.map(n => n.r)) < 9, '过完上路口 → 基地 走的是上路（不下沉到 r≥9）');
  check(!!pl && Math.min(...pl.map(n => n.r)) > 3, '过完下路口 → 基地 走的是下路（不上浮到 r≤3）');
  check(!!X.aStar({ c: 21, r: 5 }, C4.laneGate.upper), '上口 → 上路口 可达');
  check(!!X.aStar({ c: 21, r: 6 }, C4.laneGate.lower), '下口 → 下路口 可达');
}

/* 防线列按关卡覆盖：第四关防线摆在中央岩体西侧 */
check(X.G.lv.lineCol === 5 && X.G.lv.supportCol === 3, '第四关防线列写进关卡配置 (5 / 3)');
newGameSkip(2);
check(X.MINE_TILE.c === 10 && X.MINE_TILE.r === 2, '回到第二关：MINE_TILE 复位到 (10,2)');
check(X.SPAWN_UPPER.c === 20 && X.SPAWN_UPPER.r === 2 && X.SPAWN_LOWER.c === 21 && X.SPAWN_LOWER.r === 12,
  '回到第二关：刷怪点复位到 (20,2) / (21,12)');



/* ============================================================ */
section('14. 第四关新怪（骷髅 / 持盾骷髅）+ 新兵种圣剑士');
const SK = X.BASE.skeleton, SG = X.BASE.skullguard, HB = X.BASE.holyblade;
check(!!SK && !!SG && !!HB, '新增：骷髅 / 持盾骷髅 / 圣剑士');
check(SK.hp === 25 && SK.dmg === 1.9 && SK.atkRate === 1 && SK.range === 1 && SK.moveSpeed === 1,
  '骷髅：25 血 / 1.9 攻 / 1.0 攻速 / 射程 1 / 移速 1');
check(SK.rangedResist === 0.3, '骷髅：远程伤害减免 30%');
check(SG.hp === 260 && SG.dmg === 7 && SG.atkRate === 1.1 && SG.range === 2 && SG.moveSpeed === 1.2,
  '持盾骷髅：260 血 / 7 攻 / 1.1 攻速 / 射程 2 / 移速 1.2');
check(SG.rangedResist === 0.5, '持盾骷髅：远程伤害减免 50%');
check(SG.raiseFallen === true && SG.tier === 'elite', '持盾骷髅：精英单位 + 击杀转化');
check(HB.hp === 25 && HB.dmg === 1.2 && HB.atkRate === 1.5 && HB.range === 2 && HB.moveSpeed === 0.8,
  '圣剑士：25 血 / 1.2 攻 / 1.5 攻速 / 射程 2 / 移速 0.8');
check(HB.kind === 'melee' && HB.cost === 1 && HB.stun === 0.3, '圣剑士：近战 / 消耗 1 行动值 / 命中眩晕 0.3 秒');

/* ---- 14.2 远程伤害减免 ---- */
newGameSkip(4);
X.G.units.length = 0;
{
  const s = X.makeUnit('skeleton', 'enemy', { c: 16, r: 5 }); s.hp = s.hpMax = 100;
  X.G.units.push(s);
  X.damageUnit(s, 10, null, { ranged: true });
  check(Math.abs(s.hp - 93) < 1e-6, `骷髅吃 10 点远程只掉 7（实际掉 ${(100 - s.hp).toFixed(2)}）`);
  X.damageUnit(s, 10, null, { melee: true });
  check(Math.abs(s.hp - 83) < 1e-6, '骷髅吃近战不减免（掉 10）');
}
{
  const g = X.makeUnit('skullguard', 'enemy', { c: 17, r: 5 }); g.hp = g.hpMax = 200;
  X.G.units.push(g);
  X.damageUnit(g, 10, null, { ranged: true });
  check(Math.abs(g.hp - 195) < 1e-6, '持盾骷髅吃 10 点远程只掉 5');
}

/* ---- 14.3 持盾骷髅：击杀士兵 → 骷髅 ---- */
newGameSkip(4);
X.G.units.length = 0;
{
  const sg = X.makeUnit('skullguard', 'enemy', { c: 16, r: 5 });
  const sol = X.makeUnit('swordsman', 'player', { c: 17, r: 5 }); sol.hp = sol.hpMax = 5;
  X.G.units.push(sg, sol);
  const before = X.G.units.length;
  X.damageUnit(sol, 99, sg, { melee: true, attacker: sg });
  check(!sol.alive, '士兵被持盾骷髅击杀');
  check(X.G.units.length === before + 1, '原地多出一个骷髅');
  const raised = X.G.units[X.G.units.length - 1];
  check(raised.typeId === 'skeleton' && raised.side === 'enemy' && raised.c === 17 && raised.r === 5,
    '转化出的骷髅在阵亡位置、算敌方单位');
  check(raised.raisedFrom === 'swordsman', '骷髅记录了来源兵种');
}
newGameSkip(4);
X.G.units.length = 0;
{
  const m = X.makeUnit('monster', 'enemy', { c: 16, r: 5 });
  const sol = X.makeUnit('swordsman', 'player', { c: 17, r: 5 }); sol.hp = sol.hpMax = 5;
  X.G.units.push(m, sol);
  const before = X.G.units.length;
  X.damageUnit(sol, 99, m, { melee: true, attacker: m });
  check(!sol.alive && X.G.units.length === before, '普通怪击杀不产生骷髅');
}
{
  const sg2 = X.makeUnit('skullguard', 'enemy', { c: 16, r: 5 });
  const miner = X.makeUnit('miner', 'player', { c: 17, r: 5 }); miner.hp = miner.hpMax = 3;
  X.G.units.push(sg2, miner);
  const before = X.G.units.length;
  X.damageUnit(miner, 99, sg2, { melee: true, attacker: sg2 });
  check(!miner.alive && X.G.units.length === before, '矿工被击杀不会变骷髅（不算士兵）');
}

/* ---- 14.4 圣剑士：眩晕 / 范围 / 不屈 ---- */
newGameSkip(4);
X.G.units.length = 0;
{
  const hb = X.makeUnit('holyblade', 'player', { c: 5, r: 5 });
  const e  = X.makeUnit('skeleton', 'enemy', { c: 6, r: 5 }); e.hp = e.hpMax = 200;
  X.G.units.push(hb, e);
  const t0 = X.gameTime_get();
  X.attack(hb, e);
  check(e.hp < 200, '圣剑士命中造成伤害');
  check(e.stunUntil > t0 + 0.25 && e.stunUntil <= t0 + 0.35,
    `命中眩晕约 0.3 秒（${(e.stunUntil - t0).toFixed(2)}s）`);
  check(X.isStunned(e), '目标处于眩晕状态');
}
newGameSkip(4);
X.G.units.length = 0;
{
  const hb = X.makeUnit('holyblade', 'player', { c: 5, r: 5 }); hb.lv = 2; X.applyPassives(hb);
  check(hb.pas.stunSplash === true, '圣剑士 Lv2 获得「圣光斩」');
  const a = X.makeUnit('skeleton', 'enemy', { c: 6, r: 5 }); a.hp = a.hpMax = 200;
  const b = X.makeUnit('skeleton', 'enemy', { c: 6, r: 6 }); b.hp = b.hpMax = 200;
  const far = X.makeUnit('skeleton', 'enemy', { c: 9, r: 5 }); far.hp = far.hpMax = 200;
  X.G.units.push(hb, a, b, far);
  X.attack(hb, a);
  check(b.hp < 200, 'Lv2：目标相邻的敌人吃到范围伤害');
  check(far.hp === 200, 'Lv2：范围外的敌人不受影响');
}
newGameSkip(4);
X.G.units.length = 0;
{
  const hb = X.makeUnit('holyblade', 'player', { c: 5, r: 5 }); hb.lv = 3; X.applyPassives(hb);
  hb.hp = hb.hpMax = 25;
  X.G.units.push(hb);
  const t0 = X.gameTime_get();
  X.damageUnit(hb, 999, null, { melee: true });
  check(hb.alive, 'Lv3：生命归零不立刻死亡');
  check(hb.hp === 0, 'Lv3：血量归零');
  check(hb.graceUntil > t0 + 3.9 && hb.graceUntil <= t0 + 4.1, '不屈持续 4 秒');
}
/* 不屈期间打不死；到点立刻死亡 */
newGameSkip(4);
X.G.units.length = 0;
{
  const hb = X.makeUnit('holyblade', 'player', { c: 5, r: 5 }); hb.lv = 3; X.applyPassives(hb);
  hb.hp = hb.hpMax = 25;
  X.G.units.push(hb);
  X.damageUnit(hb, 999, null, { melee: true });
  check(hb.alive && hb.hp === 0, '不屈触发：0 血仍存活');
  X.damageUnit(hb, 50, null, { melee: true });
  check(hb.alive, '不屈期间继续挨打也不会倒');
  hb.graceUntil = X.gameTime_get() - 0.001;   // 手动把倒计时推到终点
  X.G.phase = 'playing'; X.G.choiceOpen = false; X.G.turnPhase = 'action';
  X.update(1 / 60);
  check(!hb.alive, '不屈结束后圣剑士死亡');
}

/* ---- 14.5 第四关波次 / 行动值 / 低保 ---- */
{
  const C4b = X.LEVEL_CONFIGS[4];
  check(C4b.rounds === 6 && C4b.apPerTurn === 5, '第四关：6 回合 / 每回合 5 行动值');
  const w = C4b.laneWaves;
  check(w[1].upper.join() === 'skeleton' && w[1].lower.join() === 'skeleton', 'R1 上下各 1 骷髅');
  check(w[2].upper.join() === 'skeleton,shaman' && w[2].lower.join() === 'skeleton,shaman',
    'R2 上下各 1 骷髅 + 1 萨满');
  check(w[3].upper.join() === 'ram,skeleton,skeleton,boss' && w[3].lower.join() === 'sapper,sapper',
    'R3 上路 攻城槌+2 骷髅+BOSS / 下路 2 破坏者');
  check(w[4].upper.filter(x => x === 'skeleton').length === 3 && w[4].upper.includes('shaman')
    && w[4].lower.filter(x => x === 'skeleton').length === 3, 'R4 上下各 3 骷髅 + 萨满');
  check(w[5].upper.join() === 'wolf,wolf,wolf,boss' && w[5].lower.length === 4, 'R5 上路 3 狼骑+BOSS / 下路 4 骷髅');
  check(w[6].upper.join() === 'skullguard,skeleton,shaman,boss' && w[6].lower.join() === 'flyer,flyer,flyer,wolf',
    'R6 上路 持盾骷髅+骷髅+萨满+BOSS / 下路 3 飞行怪 + 狼骑');
  check([3,5,6].every(n => (w[n].upper||[]).includes('boss')), 'R3/R5/R6 上路各有一只 BOSS');
  check([1,2,4].every(n => !(w[n].upper||[]).includes('boss')), 'R1/R2/R4 上路没有 BOSS');
}
for (const id of [1, 2, 3, 4]) check(X.LEVEL_CONFIGS[id].floorGold === 10, `第 ${id} 关低保 = 10 金币`);
newGameSkip(3);
check(!X.buildShopPool().some(p => p.id === 'holyblade'), '第三关商店不卖圣剑士');
X.draftReset(); X.toggleDraftPick('holyblade');
newGameSkip(4);
check(X.buildShopPool().some(p => p.id === 'holyblade'), '出征时选了圣剑士 → 第四关商店可刷出');
X.draftReset();
/* 第四关第 1 回合直接出骷髅，不再塞开场垫怪 */
{
  newGameSkip(4);
  X.startRound(1);
  const lists = X.G.pendingSpawns.filter(e => e.type === 'spawn').flatMap(e => e.list);
  check(!lists.includes('monster'), '第四关 R1 不再有开场垫怪（只有骷髅）');
}

/* ---- 14.6 急救包：全场士兵回满血（15 金） ---- */
newGameSkip(4);
check(X.SHOP_SUPPLIES.find(s => s.id === 'medkit').price === 15, '急救包卖价 = 15 金币');
X.G.units.length = 0;
{
  const a = X.makeUnit('swordsman', 'player', { c: 4, r: 5 }); a.hp = 3;
  const b = X.makeUnit('archer', 'player', { c: 4, r: 7 }); b.hp = 1;
  const m = X.makeUnit('miner', 'player', { c: 7, r: 10 }); m.hp = 4;
  X.G.units.push(a, b, m);
  X.G.turnPhase = 'action';
  X.G.gold = 100;
  X.G.baseHp = X.G.baseHpMax - 10;
  X.G.shop.slots = [{ kind:'supply', id:'medkit', name:'急救包', emoji:'💊', price:15 }];
  X.buyShopItem(0);
  check(a.hp === a.hpMax && b.hp === b.hpMax, '急救包把受创士兵血量回满');
  check(m.hp === 4, '矿工不在治疗范围（不算士兵）');
  check(X.G.baseHp === X.G.baseHpMax - 10, '急救包不再回复基地');
  check(X.G.gold === 85, `急救包扣 15 金币（剩 ${X.G.gold}）`);
}
newGameSkip(4);
X.G.units.length = 0;
{
  const a = X.makeUnit('swordsman', 'player', { c: 4, r: 5 });
  X.G.units.push(a);
  X.G.turnPhase = 'action';
  X.G.gold = 100;
  X.G.shop.slots = [{ kind:'supply', id:'medkit', name:'急救包', emoji:'💊', price:15 }];
  X.buyShopItem(0);
  check(X.G.gold === 100, '全场满血时急救包不扣金币');
}



/* 上限：盾卫 / 圣剑士各 2 */
check(X.UNIT_CAPS.shield === 2, '盾卫场上上限 = 2');
check(X.UNIT_CAPS.holyblade === 2, '圣剑士场上上限 = 2');
check(X.UNIT_CAPS.swordsman === 4 && X.UNIT_CAPS.gunner === 4, '剑士 / 枪炮手上限仍为 4');
/* 圣剑士升级卡 */
check(X.SHOP_UPGRADES.some(u => u.typeId === 'holyblade' && u.lv === 2)
   && X.SHOP_UPGRADES.some(u => u.typeId === 'holyblade' && u.lv === 3), '圣剑士有 Lv2 / Lv3 升级卡');
X.draftReset(); X.toggleDraftPick('holyblade');
newGameSkip(4);
X.G.cards.holyblade = { lv: 1, summonCountThisTurn: 0 };
check(X.buildShopPool().some(p => p.kind === 'upgrade' && p.typeId === 'holyblade' && p.lv === 2),
  '拥有圣剑士后商店能刷出 Lv2 升级卡');
X.G.cards.holyblade.lv = 2;
check(X.buildShopPool().some(p => p.kind === 'upgrade' && p.typeId === 'holyblade' && p.lv === 3),
  'Lv2 之后商店能刷出 Lv3 升级卡');
X.draftReset();



/* 盾卫：血量下调 + 去掉脱战自愈 */
check(X.BASE.shield.hp === 32, '盾卫血量 = 32');
check(!X.BASE.shield.selfHeal, '盾卫不再有脱战自愈');
check(X.BASE.shield.taunt === 4, '盾卫嘲讽半径仍是 4 格');
/* 天官赐福会给单位打上 blessed 标记（渲染时头顶星星） */
newGameSkip(2);
X.G.units.length = 0;
const bl = X.makeUnit('swordsman', 'player', { c:4, r:6 });
X.G.units.push(bl);
X.resolvePosEvent('blessing');
check(bl.blessed === true, '赐福后单位带 blessed 标记（头顶显示 ★）');

/* 事件：总概率 + 正负对等 + 连击约束 */
check(X.EV_RATE === 0.88, '事件总概率 = 88%');
newGameSkip(4);
{
  const seq = [];
  for (let i = 0; i < 3000; i++) { const t = X.pickRoundEvent(); if (t) seq.push(t); }
  const pos = seq.filter(t => t === 'pos').length;
  const neg = seq.filter(t => t === 'neg').length;
  const share = pos / (pos + neg);
  check(share > 0.45 && share < 0.55, `正负事件对等（正面占比 ${(share * 100).toFixed(1)}%）`);
  let twoPos = 0, threeNeg = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i] === 'pos' && seq[i - 1] === 'pos') twoPos++;
  for (let i = 2; i < seq.length; i++) if (seq[i] === 'neg' && seq[i - 1] === 'neg' && seq[i - 2] === 'neg') threeNeg++;
  check(twoPos === 0, `不会连着两个正面（实际 ${twoPos} 次）`);
  check(threeNeg === 0, `不会连着三个负面（实际 ${threeNeg} 次）`);
}

/* ============================================================ */
section('15. 出征阵容（第 4 关起选卡）');
check(X.draftEnabled(X.LEVEL_CONFIGS[4]) === true, '第四关启用选卡');
check(X.draftEnabled(X.LEVEL_CONFIGS[3]) === false, '第三关不选卡');
check(X.draftEnabled(X.LEVEL_CONFIGS[2]) === false, '第二关不选卡');
check(X.DRAFT_MAX === 2, '商店兵种上限 = 2');
{
  const pool4 = X.draftPool(X.LEVEL_CONFIGS[4]).map(n => n.id);
  check(pool4.includes('shield') && pool4.includes('gunner') && pool4.includes('holyblade'),
    '第四关可选池 = 盾卫 / 枪炮手 / 圣剑士');
  const pool2 = X.draftPool(X.LEVEL_CONFIGS[2]).map(n => n.id);
  check(!pool2.includes('holyblade'), '第二关池里没有圣剑士');
}
X.draftReset();
check(X.toggleDraftPick('shield') === true, '选入盾卫');
check(X.toggleDraftPick('gunner') === true, '选入枪炮手');
check(X.toggleDraftPick('holyblade') === false, '第 3 个被拒绝（最多 2 个）');
check(X.draftPicks().length === 2, '当前选中 2 个');
X.toggleDraftPick('gunner');
check(X.draftPicks().join() === 'shield', '再点一次可取消选择');
/* 选卡结果：只决定本关商店卖什么，不直接送牌 */
newGameSkip(4);
check(!X.G.cards.shield, '选中的兵种不会直接进手牌（只是放进商店）');
check(!!X.G.cards.miner && !!X.G.cards.swordsman && !!X.G.cards.archer, '三张基础士兵仍必有');
{
  const cards4 = X.buildShopPool().filter(p => p.kind === 'card').map(p => p.id);
  check(cards4.includes('shield'), '选中的盾卫会出现在第四关商店');
  check(!cards4.includes('gunner') && !cards4.includes('holyblade'), '没选的兵种本关商店不出现');
}
/* 一个都不选 → 本关商店不卖任何新兵种 */
X.draftReset();
newGameSkip(4);
check(!X.buildShopPool().some(p => p.kind === 'card'), '不选任何商店兵种时，第四关商店不出售新兵种');
/* 前三关没有选卡机制，商店照旧 */
newGameSkip(2);
{
  const cards2 = X.buildShopPool().filter(p => p.kind === 'card').map(p => p.id);
  check(cards2.includes('shield') && cards2.includes('gunner'), '第二关商店照旧卖盾卫 / 枪炮手');
}


/* ============================================================ */
section('16. 图鉴（兵种 / 怪兽 / 事件）');
check(!!X.CODEX_KEY && !!X.CODEX, '图鉴模块与存档键存在');
check(X.CODEX_UNITS.length === 7, `兵种池 7 种（实际 ${X.CODEX_UNITS.length}）`);
check(X.CODEX_MONSTERS.length === 12, `怪兽池 12 种（含骷髅王，实际 ${X.CODEX_MONSTERS.length}）`);

/* 清空记录后逐条记录 */
for(const k in X.CODEX.units) delete X.CODEX.units[k];
for(const k in X.CODEX.monsters) delete X.CODEX.monsters[k];
check(X.codexProgress().units === 0 && X.codexProgress().monsters === 0, '清空后解锁数为 0');
X.codexMark('player', 'swordsman');
check(X.CODEX.units.swordsman === true, '兵种记录：剑士');
X.codexMark('enemy', 'skeleton');
check(X.CODEX.monsters.skeleton === true, '怪兽记录：骷髅');
X.codexMark('enemy', 'swordsman');
check(!X.CODEX.monsters.swordsman, '玩家兵种不会被记成怪兽');
X.codexMark('player', 'skullguard');
check(!X.CODEX.units.skullguard, '怪兽不会被记成兵种');
X.saveCodex();
check(JSON.parse(global.localStorage.getItem(X.CODEX_KEY)).monsters.skeleton === true, '图鉴写入 localStorage');
check(X.readCodex().units.swordsman === true, 'readCodex 能读回记录');

/* 开局手牌自动解锁（进度驱动） */
newGameSkip(4);
check(X.CODEX.units.miner && X.CODEX.units.archer && X.CODEX.units.swordsman, '开局手牌自动解锁基础兵种');

/* 界面渲染：卡片数量 */
const cxList = document.getElementById('codex-list');
cxList.children.length = 0;
X.renderCodex('units');
check(cxList.children.length === X.CODEX_UNITS.length, `兵种页卡片数 = ${X.CODEX_UNITS.length}`);
cxList.children.length = 0;
X.renderCodex('monsters');
check(cxList.children.length === X.CODEX_MONSTERS.length, `怪兽页卡片数 = ${X.CODEX_MONSTERS.length}`);
cxList.children.length = 0;
X.renderCodex('events');
const evTotal = Object.keys(X.POS_EVENTS).length + Object.keys(X.NEG_EVENTS).length;
check(cxList.children.length === evTotal, `事件页卡片数 = ${evTotal}（全部事件都收录）`);
check(/兵种\s+\d+\/7/.test(document.getElementById('codex-count').textContent), '标题显示解锁进度');
check(X.monsterStatLine(X.BASE.skullguard).includes('远程减伤 50%'), '怪兽条目显示特性（远程减伤）');
check(X.monsterStatLine(X.BASE.skullguard).includes('击杀转化骷髅'), '怪兽条目显示特性（击杀转化）');




/* 小偷来袭：固定偷 10 金币 */
newGameSkip(1);
X.G.gold = 50;
X.resolveNegEvent('lose_gold');
check(X.G.gold === 40, `小偷来袭固定偷 10（50 → ${X.G.gold}）`);
X.G.gold = 6;
X.resolveNegEvent('lose_gold');
check(X.G.gold === 0, '金币不足 10 时全部偷走，不会变成负数');

/* ---- 1.1 版调整：军饷事件 20 金 / 弓箭手移速 0.8 ---- */
check(/20/.test(X.POS_EVENTS.airdrop_wage.desc), '空投军饷描述改为 20 金币');
newGameSkip(1);
X.G.gold = 0;
X.resolvePosEvent('airdrop_wage');
check(X.G.gold === 20, `空投军饷实际给 20 金币（实际 ${X.G.gold}）`);
check(X.BASE.archer.moveSpeed === 0.8, '弓箭手移速 = 0.8 格/秒');
check(X.BASE.archer.dmg === 0.95 && X.BASE.archer.hp === 12, '弓箭手血/攻未被本次改动影响');

/* ============================================================ */
section('17. 重置进度（正式版工具）');
X.CLEARED[1] = true; X.saveCleared();
X.codexMark('player', 'shield'); X.saveCodex();
check(X.resetProgress() === true, 'resetProgress 执行成功');
check(!X.CLEARED[1], '通关记录已清空');
check(!X.CODEX.units.shield && !X.CODEX.monsters.skeleton, '图鉴收录已清空');
check(!X.hasBattleSave(), '战斗存档已清空');
check(JSON.parse(global.localStorage.getItem(X.CLEAR_SAVE_KEY) || '{}')[1] !== true, '通关记录存储同步清空');

/* ============================================================ */
section('18. 第五关守卫者：商店卡 / 光环 / 免伤 / 自爆');

/* ---- 商店卡定义 ---- */
const GD_CARD = X.SHOP_NEW_CARDS.find(c=>c.id==='guardian');
check(!!GD_CARD, '守卫者在商店新卡表里');
check(GD_CARD.price === 75, `守卫者售价 75 金币（实际 ${GD_CARD.price}）`);
check(GD_CARD.levels && GD_CARD.levels.length===1 && GD_CARD.levels[0]===5, '守卫者只在第五关商店上架');
check(X.BASE.guardian.cost === 2, '守卫者召唤消耗 2 点行动值');
check(X.unitCap('guardian') === 2, '守卫者场上上限 = 2');
check(!X.SHOP_UPGRADES.some(u=>u.typeId==='guardian'), '守卫者没有 Lv2 / Lv3 升级卡（等级恒为 1）');
check(X.BASE.guardian.allyAtkAura === 0.15, '光环：友军攻击 +15%');
check(X.BASE.guardian.dmgReduce === 0.20, '免伤：自身受伤 -20%');
check(X.BASE.guardian.deathBomb.dmg === 66 && X.BASE.guardian.deathBomb.radius === 2,
      '阵亡爆炸：66 伤 / 半径 2 格');

/* ---- 第五关：圣剑士 / 枪炮手 / 守卫者 / 盾卫 四选二 ---- */
X.draftReset();                       // 清空出征选卡
newGameSkip(5);
let pool5No = X.buildShopPool();
check(!pool5No.some(it=>it.kind==='card' && it.id==='guardian'), '没选守卫者 → 第五关商店不进货');
check(X.draftPool(X.LEVEL_CONFIGS[5]).map(nc=>nc.id).join(',') === 'shield,gunner,holyblade,guardian',
      '第五关可选商店兵种 = 盾卫 / 枪炮手 / 圣剑士 / 守卫者（四张卡）');
check(X.DRAFT_MAX === 2, '第五关最多选 2 个（4 选 2）');
check(X.toggleDraftPick('guardian') === true, '守卫者是可选项，点一下就选中');
check(X.draftPicks().join(',') === 'guardian', '选卡名额记上守卫者');
check(X.toggleDraftPick('holyblade') === true && X.draftPicks().length === 2, '再选圣剑士 → 满 2 个');
check(X.toggleDraftPick('shield') === false && X.draftPicks().length === 2, '第 3 个选不进去（4 选 2）');
X.draftReset();
newGameSkip(5);
check(!X.buildShopPool().some(it=>it.kind==='card' && it.id==='guardian'), '一个都不选时货架也没有守卫者');
newGameSkip(2);
let pool2 = X.buildShopPool();
check(!pool2.some(it=>it.kind==='card' && it.id==='guardian'), '第二关商店池不含守卫者（关卡限定）');

/* ---- 选中的新兵种必须真的出现在货架上（不能靠随机刷） ---- */
X.draftReset(); X.toggleDraftPick('holyblade');
newGameSkip(5);
X.G.turnPhase='action'; X.G.ap=5; X.G.gold=200; X.G.shop.refreshLeft=2;
X.refreshShop(false);
check(X.G.shop.slots.some(it=>it.kind==='card' && it.id==='holyblade'), '选中的圣剑士第一轮货架就有货');
X.refreshShop(false);
check(X.G.shop.slots.some(it=>it.kind==='card' && it.id==='holyblade'), '刷新后圣剑士仍在货架上');
X.draftReset();

/* ---- 召唤耗 2 行动值 ---- */
newGameSkip(5);
X.G.turnPhase = 'action';
X.G.cards.guardian = { lv:1, summonCountThisTurn:0 };
X.G.ap = 1;
X.beginSummon('guardian');
check(!X.G.pendingSummon, '只有 1 行动值时无法召唤守卫者');
X.G.ap = 2;
X.beginSummon('guardian');
check(!!X.G.pendingSummon, '2 行动值时进入选点');
const freeT = (()=>{
  for(let dc=-2;dc<=2;dc++)for(let dr=-2;dr<=2;dr++){
    const c = X.BASE_TILE.c+dc, r = X.BASE_TILE.r+dr;
    if(X.passable(c,r) && !X.occupiedAt(c,r)) return {c,r};
  }
  return null;
})();
X.tryPlaceSummon(freeT.c, freeT.r);
check(X.G.ap === 0, `召唤守卫者扣 2 点行动值（剩余 ${X.G.ap}）`);
check(X.unitCount('guardian') === 1, '场上出现 1 名守卫者');

/* ---- 场上限 2：第二只放得下，第三只不行 ---- */
const freeT2 = (()=>{
  for(let dc=-2;dc<=2;dc++)for(let dr=-2;dr<=2;dr++){
    const c = X.BASE_TILE.c+dc, r = X.BASE_TILE.r+dr;
    if(X.passable(c,r) && !X.occupiedAt(c,r)) return {c,r};
  }
  return null;
})();
X.G.ap = 5;
X.beginSummon('guardian');
check(!!X.G.pendingSummon, '上限 2：第二只守卫者可以进选点');
X.tryPlaceSummon(freeT2.c, freeT2.r);
check(X.unitCount('guardian') === 2, `场上出现 2 名守卫者（实际 ${X.unitCount('guardian')}）`);
X.G.ap = 5;
X.beginSummon('guardian');
check(!X.G.pendingSummon, '第三只守卫者召唤不出去（上限 2）');

/* ---- 光环：友军攻击 +15% ---- */
const mate = X.makeUnit('swordsman','player',{c:freeT.c-1,r:freeT.r});
X.G.units.push(mate);
const auraWith = X.allyAtkAuraMul(mate);
const gds = X.G.units.filter(u=>u.alive && u.typeId==='guardian');
const gd  = gds[0];
for(const g of gds) g.alive = false;               // 临时"全部下场"验证光环消失
const auraWithout = X.allyAtkAuraMul(mate);
for(const g of gds) g.alive = true;
check(Math.abs(auraWith-1.15) < 1e-9, `有守卫者时友军伤害倍率 1.15（实际 ${auraWith}）`);
check(Math.abs(auraWithout-1) < 1e-9, `守卫者不在场时倍率回到 1（实际 ${auraWithout}）`);

/* ---- 免伤 20% ---- */
const gdHp0 = gd.hp;
X.damageUnit(gd, 10, null, {});
check(Math.abs((gdHp0-gd.hp) - 8) < 1e-6, `守卫者受 10 伤只掉 8 血（实际掉 ${(gdHp0-gd.hp).toFixed(2)}）`);

/* ---- 阵亡自爆：2 格内 66 伤，圈外不挨打 ----
   靶子用攻城领主（270 血）：攻城槌削血后只剩 60，撑不住 66 点自爆伤害，
   会算成"只掉了 60"，量不出爆炸的真实数值。 */
const near1 = X.makeUnit('warlord','enemy',{c:gd.c+1,r:gd.r});  // 距 1 格
const near2 = X.makeUnit('warlord','enemy',{c:gd.c,r:gd.r+2});  // 距 2 格
const far   = X.makeUnit('warlord','enemy',{c:gd.c,r:gd.r+3});  // 距 3 格
X.G.units.push(near1, near2, far);
const hpN1 = near1.hp, hpN2 = near2.hp, hpF = far.hp;
gd.hp = 1;
X.damageUnit(gd, 999, null, {});
check(!gd.alive, '守卫者被击倒');
check(Math.abs((hpN1-near1.hp) - 66) < 1e-6, `1 格内敌人受 66 伤（实际 ${(hpN1-near1.hp).toFixed(1)}）`);
check(Math.abs((hpN2-near2.hp) - 66) < 1e-6, `2 格内敌人受 66 伤（实际 ${(hpN2-near2.hp).toFixed(1)}）`);
check(Math.abs(hpF - far.hp) < 1e-6, '3 格外的敌人不受爆炸影响');
check(X.G.baseHp === X.G.baseHpMax, '爆炸不会误伤基地');

/* ============================================================ */
section('19. 第五关 BOSS：骷髅王（破体出场 / 转化 / 召唤 / 阵亡）');

const KING = X.BASE.skullking;
check(KING.hp === 600, `骷髅王血量 600（实际 ${KING.hp}）`);
check(KING.dmg === 20, `每击 20 伤（实际 ${KING.dmg}）`);
check(KING.range === 3, `射程 3 格（实际 ${KING.range}）`);
check(KING.atkRate === 0.5, `攻击频率 0.5 次/秒 = 2 秒一刀（实际 ${KING.atkRate}）`);
check(KING.moveSpeed === 0.4, `移速 0.4 格/秒（实际 ${KING.moveSpeed}）`);
check(KING.tier === 'boss', '骷髅王是 BOSS 级单位（有登场弹窗）');
check(KING.minion && KING.minion.every === 10, '每 10 秒召唤 1 个骷髅');
check(KING.deathSummon && KING.deathSummon.count === 2, '阵亡召唤 2 个骷髅');
check(KING.spawnTransform === 2, '出场转化 2 名我方士兵');
check(!!X.UNIT_INTRO.skullking, '有专属登场介绍（BOSS 弹窗）');
check(X.LEVEL_CONFIGS[5].kingVessel === true, '第五关配置了骷髅王容器');
check(X.LEVEL_CONFIGS[5].kingVesselWave === 7, '容器只在第 7 波（最后一波）出现');
check(X.KING_BURST_DUR > 0 && X.KING_BGM_SEC === 15, '破体动画 + 15 秒专属 BGM');

/* ---- 出怪：第一只持盾骷髅是容器（且只在第 7 波才有资格） ---- */
X.draftReset();
newGameSkip(5);
X.G.phase='playing'; X.G.turnPhase='action';
/* 第 5 波也有持盾骷髅 —— 它不该被当成容器 */
X.G.round = 5;
X.runEvent({ type:'spawn', port:'down', list:['skullguard'] });
const w5guard = X.G.units.find(u=>u.typeId==='skullguard');
check(w5guard && !w5guard.vessel, '第 5 波的持盾骷髅不是容器（骷髅王不会提前登场）');
X.rawDamage(w5guard, 999);
check(!X.G.kingBurst, '第 5 波那只倒下不会触发破体动画');

X.G.round = 7;
X.runEvent({ type:'spawn', lane:'lower', list:['skullguard','skullguard'] });
const guards = X.G.units.filter(u=>u.typeId==='skullguard' && u.alive);
check(guards.length === 2, '放出 2 只持盾骷髅');
check(guards.filter(u=>u.vessel).length === 1, '只有第一只是骷髅王容器');
check(guards[0].vessel === true, '容器挂在第一只身上');

/* ---- 容器倒下：先播动画，动画走完才生成骷髅王 ---- */
const vessel = guards[0];
const vc = vessel.c, vr = vessel.r;
X.rawDamage(vessel, 999);
check(!vessel.alive, '容器倒下');
check(!!X.G.kingBurst, '开始播放破体动画');
check(!X.G.units.some(u=>u.typeId==='skullking'), '动画期间骷髅王还没成形');

/* 场上先摆 3 个我方士兵（含守卫者）用于验证"夺走 2 名" */
const kS1 = X.makeUnit('swordsman','player',{c:X.BASE_TILE.c,   r:X.BASE_TILE.r+1});
const kS2 = X.makeUnit('archer','player',   {c:X.BASE_TILE.c+1, r:X.BASE_TILE.r});
const kGd = X.makeUnit('guardian','player', {c:X.BASE_TILE.c+2, r:X.BASE_TILE.r});
/* 把剑士挪到容器【隔壁】→ 既保证它是最靠近骷髅王的那个，又不会占住容器格
   （占住的话骷髅王会被挤到邻格，位置断言就没意义了） */
const kAdj = [[1,0],[0,1],[-1,0],[0,-1]].find(([dc,dr]) =>
  X.passable(vc+dc, vr+dr) && !X.occupiedAt(vc+dc, vr+dr));
if(kAdj){ kS1.c = vc + kAdj[0]; kS1.r = vr + kAdj[1]; }
X.G.units.push(kS1, kS2, kGd);

const skel0 = X.G.units.filter(u=>u.typeId==='skeleton' && u.alive).length;
X.tickKingBurst(X.KING_BURST_DUR + 0.01);
const king = X.G.units.find(u=>u.typeId==='skullking' && u.alive);
check(!!king, '动画结束 → 骷髅王登场');
check(king.c === vc && king.r === vr, `骷髅王出现在容器倒下的位置 (${vc},${vr})`);
check(X.G.kingSpawned === true, '本局骷髅王只登场一次');
check(X.G.introQueue.indexOf('skullking') >= 0 || X.G.introFreeze > 0, '触发了 BOSS 弹窗（登场演出）');

/* ---- 出场转化：拿走 2 名士兵，守卫者不可选 ---- */
check(!kS1.alive, '最近的剑士被夺走');
check(kGd.alive === true, '守卫者不可被选中（还活着）');
const skel1 = X.G.units.filter(u=>u.typeId==='skeleton' && u.alive).length;
check(skel1 > skel0, `我方士兵被转化成了骷髅（${skel0} → ${skel1}）`);
check(X.G.units.filter(u=>u.side==='player' && u.typeId!=='guardian' && u.alive).length ===
      X.G.units.filter(u=>u.side==='player' && u.typeId!=='guardian' && u.alive && !u.isBase).length,
      '我方只剩未被选中的单位');

/* ---- 每 10 秒召唤 1 个骷髅 ---- */
X.G.introFreeze = 0; X.G.introQueue = [];
/* 用「见过的骷髅 uid 集合」统计：这 10 秒里我方可能打死一两只骷髅，
   只看存活数会漏掉新召唤出来的那只 */
const seenSkel = new Set(X.G.units.filter(u=>u.typeId==='skeleton').map(u=>u.uid));
const before = seenSkel.size;
for(let i=0;i<205;i++){
  X.update(0.05);                             // ≈10.25 秒
  for(const u of X.G.units) if(u.typeId==='skeleton') seenSkel.add(u.uid);
}
const after = seenSkel.size;
check(after >= before + 1, `10 秒后骷髅王多召唤了 1 个骷髅（${before} → ${after}）`);

/* ---- 阵亡：再召唤 2 个骷髅 ---- */
const skelBeforeDeath = X.G.units.filter(u=>u.typeId==='skeleton' && u.alive).length;
X.rawDamage(king, 9999);
check(!king.alive, '骷髅王被击倒');
const skelAfterDeath = X.G.units.filter(u=>u.typeId==='skeleton' && u.alive).length;
check(skelAfterDeath >= skelBeforeDeath + 2, `阵亡召唤 2 个骷髅（${skelBeforeDeath} → ${skelAfterDeath}）`);

/* ---- 不会重复生成 ---- */
X.spawnKingAt(X.BASE_TILE.c+3, X.BASE_TILE.r);
check(!X.G.units.some(u=>u.typeId==='skullking' && u.alive), '骷髅王已被标记登场过，不会再生成第二只');

/* ============================================================ */
section('20. 第五关波次：按出怪口逐个配置（左 / 右 / 下）');

const PW = X.LEVEL_CONFIGS[5].portWaves;
check(!!PW, '第五关用 portWaves 配置波次');
check(X.LEVEL_CONFIGS[5].spawnPorts.map(p=>p.key).join(',') === 'left,right,down',
  '三个出怪口分别叫 left / right / down');

const cnt = (a, id) => (a || []).filter(x=>x===id).length;
check(PW[1].left.length === 1 && PW[1].right.length === 1 && !PW[1].down,
  '第 1 波：左右各 1 只（下方不出）');
check(cnt(PW[1].left,'skeleton') === 1 && cnt(PW[1].right,'skeleton') === 1,
  '第 1 波：左右刷的都是骷髅');
check(PW[1].reward === true, '第 1 波有奖励事件');

check(cnt(PW[2].right,'ram') === 1 && PW[2].right.length === 1, '第 2 波：右侧 1 个攻城槌');
check(cnt(PW[2].down,'wolf') === 1 && PW[2].down.length === 1, '第 2 波：下方 1 个狼骑');
check(!PW[2].left, '第 2 波：左侧不出怪');

check(cnt(PW[3].left,'skeleton') === 1 && cnt(PW[3].left,'shaman') === 1,
  '第 3 波：左侧 1 骷髅 + 1 萨满');
check(cnt(PW[3].right,'skeleton') === 1 && cnt(PW[3].right,'shaman') === 1,
  '第 3 波：右侧 1 骷髅 + 1 萨满');
check(cnt(PW[3].down,'flyer') === 1 && PW[3].down.length === 1, '第 3 波：下方 1 个飞行怪');

for(const k of ['left','right','down']){
  check(PW[4][k].length === 4 && cnt(PW[4][k],'skeleton') === 4, `第 4 波：${k} 口刷 4 只骷髅`);
}
check(cnt(PW[5].down,'skullguard') === 1 && PW[5].down.length === 1, '第 5 波：下方 1 个持盾骷髅');
check(cnt(PW[5].left,'boss') === 1 && cnt(PW[5].right,'boss') === 1, '第 5 波：左右各 1 个 BOSS');

for(const k of ['left','right']){
  const w = PW[6][k];
  check(cnt(w,'shaman') === 2, `第 6 波：${k} 口 2 个萨满`);
  check(cnt(w,'ram') === 2,    `第 6 波：${k} 口 2 个攻城槌`);
  check(cnt(w,'boss') === 1,   `第 6 波：${k} 口 1 个 BOSS`);
  check(cnt(w,'wolf') === 1,   `第 6 波：${k} 口 1 个狼骑`);
  check(cnt(w,'flyer') === 1,  `第 6 波：${k} 口 1 个飞行怪`);
  check(w.length === 7,        `第 6 波：${k} 口共 7 只`);
}
check(!PW[6].down, '第 6 波：下方不出怪');
check(cnt(PW[7].down,'skullguard') === 1 && PW[7].down.length === 1,
  '第 7 波：下方刷 1 只持盾骷髅（骷髅王的容器）');
check(!PW[7].left && !PW[7].right, '第 7 波：左右不出怪');

/* ---- 实跑一遍：每个口的怪确实从自己那个口出来、走自己那个门 ---- */
X.draftReset();
newGameSkip(5);
X.G.phase = 'playing';
const PORTS = X.LEVEL_CONFIGS[5].spawnPorts;
const portByKey = k => PORTS.find(p => p.key === k);
for(let n=1;n<=7;n++){
  X.startRound(n);
  X.G.triggerQueue = [];                      // 跳过奖励 / 随机事件模态
  const evs = X.G.pendingSpawns.slice();
  let total = 0;
  for(const ev of evs){
    check(!!ev.port, `第 ${n} 波带出怪口标记（${ev.port}）`);
    const before = X.G.units.length;
    X.runEvent(ev);
    const added = X.G.units.slice(before);
    total += added.length;
    const p = portByKey(ev.port);
    for(const u of added){
      const near = Math.abs(u.c - p.c) <= 4 && Math.abs(u.r - p.r) <= 4;
      check(near, `第 ${n} 波 ${u.typeId} 从 ${ev.port} 口附近出生 (${u.c},${u.r})`);
      check(!!u.gate && u.gate.c === p.gate.c && u.gate.r === p.gate.r,
        `第 ${n} 波 ${u.typeId} 走 ${ev.port} 口自己的门`);
    }
  }
  const expect = ['left','right','down'].reduce((s,k)=> s + ((PW[n][k]||[]).length), 0);
  check(total === expect, `第 ${n} 波共出 ${expect} 只（实际 ${total}）`);
}

/* ============================================================ */
section('21. 第七波：容器没死 / 破体动画没播完 → 不能判胜');

X.draftReset();
newGameSkip(5);
X.G.phase = 'playing';
X.G.round = 7; X.G.turnPhase = 'enemy';
X.startRound(7);
X.G.triggerQueue = [];
for(const ev of X.G.pendingSpawns.slice()) X.runEvent(ev);
const vessel21 = X.G.units.find(u => u.vessel && u.alive);
check(!!vessel21, '第七波刷出被附体的持盾骷髅（容器）');

/* 测试桩里 setTimeout 会立即执行，runEvent 末尾的 processNextEvent 会把阶段拨回
   action —— 每次推进前手动拨回 enemy，否则清场判定根本不会跑到 */
const toEnemy = () => { X.G.turnPhase = 'enemy'; X.G.round = 7; X.G.phase = 'playing'; };

/* ① 容器还活着 → 撑过去不算赢，必须先打死它 */
X.G.introFreeze = 0; X.G.introQueue = [];       // 跳过精英登场演出（它会冻结 update）
toEnemy();
for(let i=0;i<20;i++) X.update(0.05);
check(X.G.result === null, '容器还活着 → 不会直接判胜');
check(X.kingPending() === true, 'kingPending：容器在场时为真');

/* ② 容器倒下 → 破体动画这 2.2 秒里场上确实没有敌人，但绝不能判胜 */
X.rawDamage(vessel21, 99999);
check(!vessel21.alive, '容器被击倒');
check(!!X.G.kingBurst, '开始播放破体动画');
toEnemy();
for(let i=0;i<20;i++) X.update(0.05);
check(X.G.result === null, '破体动画播放期间不会判胜（骷髅王还没成形）');
check(X.kingPending() === true, 'kingPending：动画在播时为真');

/* ③ 动画走完 → 骷髅王登场，照样不能判胜
   （推进到"骷髅王出现"就停手 —— 再往下推它就把基地拆了，那是另一回事） */
toEnemy();
for(let i=0;i<300 && !X.G.units.some(u=>u.typeId==='skullking' && u.alive); i++) X.update(0.05);
const king21 = X.G.units.find(u => u.typeId==='skullking' && u.alive);
check(!!king21, '骷髅王破体而出');
check(king21 && king21.hp === 600, `骷髅王 600 血（实际 ${king21 && king21.hp}）`);
X.G.introFreeze = 0; X.G.introQueue = [];       // 跳过 BOSS 登场演出
toEnemy();
for(let i=0;i<20;i++) X.update(0.05);
check(X.G.result === null, '骷髅王登场后仍未判胜');

/* ④ 打死骷髅王、清掉它阵亡召唤的 2 个骷髅 → 才判胜 */
X.rawDamage(king21, 99999);
const rest21 = X.G.units.filter(u => u.side==='enemy' && u.alive);
check(rest21.length === 2, `骷髅王阵亡召唤 2 个骷髅（实际 ${rest21.length}）`);
for(const u of rest21) X.rawDamage(u, 99999);
toEnemy();
for(let i=0;i<20;i++) X.update(0.05);
check(X.G.result === 'win', '骷髅王与残余全部清空后才判胜');

/* ==================== 22. 精英 / BOSS：30% 控制减免 ================ */
log('\n【22】精英 / BOSS 控制减免 30%');

/* 普通怪：没有控制减免 */
const cc_m = X.makeUnit('monster', 'enemy', { c: 19, r: 2 });
const cc_s = X.makeUnit('skeleton', 'enemy', { c: 19, r: 2 });
/* 精英 */
const cc_w = X.makeUnit('warlord', 'enemy', { c: 19, r: 2 });
const cc_g = X.makeUnit('skullguard', 'enemy', { c: 19, r: 2 });
const cc_b = X.makeUnit('boss', 'enemy', { c: 19, r: 2 });
const cc_o = X.makeUnit('overlord', 'enemy', { c: 19, r: 2 });
const cc_k = X.makeUnit('skullking', 'enemy', { c: 19, r: 2 });

check(X.CC_RESIST_TIER === 0.30, `控制减免档位 = 30%（实际 ${X.CC_RESIST_TIER}）`);
check(X.ccResistOf(cc_m) === 0, '普通怪（小怪）控制减免 = 0');
check(X.ccResistOf(cc_s) === 0, '普通怪（骷髅）控制减免 = 0');
check(X.ccResistOf(cc_w) === 0.30, '精英：攻城领主 控制减免 30%');
check(X.ccResistOf(cc_g) === 0.30, '精英：持盾骷髅 控制减免 30%');
check(X.ccResistOf(cc_b) === 0.30, 'BOSS：攻城槌王 控制减免 30%');
check(X.ccResistOf(cc_o) === 0.30, 'BOSS：统御者 控制减免 30%');
check(X.ccResistOf(cc_k) === 0.30, 'BOSS：骷髅王 控制减免 30%');
check(X.ccResistOf(null) === 0, 'ccResistOf(null) 兜底为 0');

/* 单值覆写：单位自带 ccResist 优先，且被夹在 0~1 */
cc_m.ccResist = 0.5;
check(X.ccResistOf(cc_m) === 0.5, '自定义 ccResist 优先于 tier 兜底');
cc_m.ccResist = 2;
check(X.ccResistOf(cc_m) === 1, 'ccResist 上限夹到 1');
cc_m.ccResist = 0;

/* 时长打折：applyCcResist 直接算 */
check(Math.abs(X.applyCcResist(cc_m, 2, true) - 2) < 1e-9, '无减免单位：2 秒控制仍是 2 秒');
check(Math.abs(X.applyCcResist(cc_w, 2, true) - 1.4) < 1e-9, '精英：2 秒控制 → 1.4 秒');
check(Math.abs(X.applyCcResist(cc_k, 2, true) - 1.4) < 1e-9, 'BOSS：2 秒控制 → 1.4 秒');

/* 端到端：圣剑士（命中眩晕 0.3 秒）砍普通怪 vs 精英 / BOSS */
check(X.BASE.holyblade.stun === 0.3, '圣剑士基础眩晕 0.3 秒');
const cc_hb = X.makeUnit('holyblade', 'player', { c: 3, r: 6 });
check(cc_hb.stun === 0.3, '圣剑士单位带 stun 0.3');

const ccT0 = X.gameTime;
X.applyStunTo(cc_m, cc_hb);
const durNormal = cc_m.stunUntil - ccT0;
check(Math.abs(durNormal - 0.3) < 1e-9, `普通怪被眩晕 0.3 秒（实际 ${durNormal.toFixed(3)}）`);

const ccT1 = X.gameTime;
X.applyStunTo(cc_w, cc_hb);
const durElite = cc_w.stunUntil - ccT1;
check(Math.abs(durElite - 0.21) < 1e-9, `精英被眩晕 0.21 秒（0.3 × 70%，实际 ${durElite.toFixed(3)}）`);

const ccT2 = X.gameTime;
X.applyStunTo(cc_k, cc_hb);
const durBoss = cc_k.stunUntil - ccT2;
check(Math.abs(durBoss - 0.21) < 1e-9, `BOSS 被眩晕 0.21 秒（0.3 × 70%，实际 ${durBoss.toFixed(3)}）`);

/* 减免不是无限叠加：连续两发只取更晚的那个时刻，不会被打折两次后的短眩晕顶掉 */
const stunBefore = cc_w.stunUntil;
X.applyStunTo(cc_w, cc_hb);
check(cc_w.stunUntil >= stunBefore, '重复眩晕取更晚时刻（不会被新短控覆盖）');

/* 图鉴 / 单位面板要能看见这条特性 */
const ccLine = X.monsterStatLine(X.BASE.skullking);
check(ccLine.includes('控制减免 30%'), `骷髅王图鉴标注控制减免（实际：${ccLine}）`);
check(!X.monsterStatLine(X.BASE.monster).includes('控制减免'), '普通怪图鉴不标注控制减免');

/* ============================================================ */
log(`\n========== 结果：${pass} 通过 / ${fail} 失败 ==========`);
process.exit(fail === 0 ? 0 : 1);
