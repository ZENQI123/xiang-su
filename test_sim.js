/* ============================================================
   战斗模拟测试：真实跑 update() 循环，验证
   - 敌人能否走到基地并造成伤害（近战够得着基地）
   - 玩家士兵能否击杀敌人
   - 完整3回合流程
   - 渲染 draw() 不抛异常
   ============================================================ */
const fs = require('fs');
const src = fs.readFileSync('game.js', 'utf8');

const noop = () => {};
function mkCtx() {
  const state = { fillStyle:'', strokeStyle:'', lineWidth:1, font:'', textAlign:'', imageSmoothingEnabled:true };
  const target = {
    fillRect: noop, strokeRect: noop, clearRect: noop, drawImage: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, ellipse: noop,
    fill: noop, stroke: noop, closePath: noop, setLineDash: noop,
    fillText: noop, save: noop, restore: noop, translate: noop, scale: noop,
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in state) return state[k];
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { state[k] = v; return true; }
  });
}
function mkEl(tag) {
  const _cls = new Set();
  const el = {
    tagName: tag, style: {}, children: [],
    classList: {
      add: (...c) => c.forEach(x => _cls.add(x)),
      remove: (...c) => c.forEach(x => _cls.delete(x)),
      contains: (c) => _cls.has(c),
      toggle: (c) => _cls.has(c) ? _cls.delete(c) : _cls.add(c),
    },
    _text: '', _html: '',
    get textContent() { return this._text; }, set textContent(v) { this._text = v; },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; },
    appendChild(c) { el.children.push(c); return c; },
    insertBefore(c) { el.children.push(c); return c; },
    removeChild() {}, remove() {},
    querySelector() { return mkEl('button'); },
    querySelectorAll() { return []; },
    addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1232, height: 728, right: 1232, bottom: 728 }),
    scrollTop: 0, scrollHeight: 0, disabled: false, onclick: null,
    getContext: () => mkCtx(),
    width: 1232, height: 728,
  };
  return el;
}
const registry = {};
global.document = {
  getElementById: (id) => { if (!registry[id]) registry[id] = mkEl('div'); return registry[id]; },
  createElement: (t) => mkEl(t),
  addEventListener: noop,
  body: mkEl('body'),
};
/* 镜像真实页面：菜单三屏默认 hidden，标题可见 —— 但模拟测试要的是"战场已激活"，
   因此这里把三屏都设为 hidden，让 update() 不被菜单冻结。 */
function hideMenus(){
  for(const id of ['title-screen','level-select','briefing','overlay','help-overlay']){
    global.document.getElementById(id).classList.add('hidden');
  }
}
hideMenus();
global.window = { addEventListener: noop, innerWidth: 1600, innerHeight: 900 };
let clock = 0;
global.performance = { now: () => clock };
// 关键：让 setTimeout 不立即执行，改为排队 —— 避免递归启动回合
const timers = [];
global.setTimeout = (f, ms) => { timers.push({ f, at: clock + (ms || 0) }); return timers.length; };
global.requestAnimationFrame = noop;

/* ---- 固定随机数：消除随机负面事件/随机攻击冷却造成的用例抖动 ---- */
let _seed = 20261010;
Math.random = function(){
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
};

const exportNames = [];   // 已改为下方 getter 形式导出

const body = src + `
;return {
  update, makeUnit, aStar, startRound, beginSummon, tryPlaceSummon, upgradeCard, damageBase,
  commandMove, newGame, tileCenter, draw, buildGround, resolveReward, occupiedAt, nearestFreeTile,
  endTurn, endGame, applyLevel, syncFieldUnits, findTarget, pxDistTiles, moveAlongPath,
  resolveNegEvent, resolvePosEvent, NEG_EVENTS, POS_EVENTS,
  closeRewardModal, closeNegModal, closePosModal,
  TIER_INFO, UNIT_INTRO, queueUnitIntro, clearUnitIntro, INTRO_DUR, runEvent,
  BASE_TILE, MINE_TILE, MINE_TILES, isMineTile, TOTAL_ROUNDS, TILE, BASE, CARD_ORDER,
  get G(){ return G; },
  get PROJ(){ return PROJ; }
};`;
const X = new Function('document','window','performance','requestAnimationFrame','setTimeout', body)(
  global.document, global.window, global.performance, global.requestAnimationFrame, global.setTimeout);
hideMenus();   // 构造后再次强制隐藏（模块启动时会把标题屏 show 出来）

const log = (...a) => console.log(...a);
let pass = 0, fail = 0;
const check = (c, m) => { if (c) { pass++; log('  ✓ ' + m); } else { fail++; log('  ✗ FAIL: ' + m); } };

/* 把 update 推进 t 秒，并处理到期的定时器 */
function sim(seconds, step = 1/60) {
  const n = Math.round(seconds / step);
  for (let i = 0; i < n; i++) {
    clock += step * 1000;
    X.update(step);
    // 执行到期定时器（回合切换等）
    for (let k = timers.length - 1; k >= 0; k--) {
      if (timers[k].at <= clock) { const t = timers.splice(k,1)[0]; try { t.f(); } catch(e) { fail++; log('  ✗ 定时器异常: ' + e.message); } }
    }
  }
}

log('===== 场景A: 1只小怪 vs 空基地（验证近战够得着基地）=====');
newGameSkip(1);

X.G.turnPhase = 'action'; X.G.ap = 4;
// 清掉场上一切，手动放一只小怪在地图右侧
X.G.units.length = 0;
const mob = X.makeUnit('monster', 'enemy', { c: 20, r: 6 });
X.G.units.push(mob);
const hp0 = X.G.baseHp;
log(`小怪起始格 (${mob.c},${mob.r})，基地格 (${X.BASE_TILE.c},${X.BASE_TILE.r})，基地HP=${hp0}`);
sim(30);                       // 30 秒足够小怪走到基地并攻击
log(`30秒后: 小怪位置 (${mob.c},${mob.r}) 存活=${mob.alive} 基地HP=${X.G.baseHp}`);
check(X.G.baseHp < hp0, '小怪成功接近并伤害了基地（近战基地判定生效）');
check(mob.c <= 3, '小怪已推进到基地附近');

log('\n===== 场景B: 剑士 1v1 小怪（敌方 ×1.5 后小怪更强）=====');
newGameSkip(1);

X.G.turnPhase = 'action';
X.G.units.length = 0;
const sw = X.makeUnit('swordsman', 'player', { c: 10, r: 6 });
const mo = X.makeUnit('monster', 'enemy', { c: 14, r: 6 });
X.G.units.push(sw, mo);
sim(25);
log(`结果: 剑士存活=${sw.alive} HP=${sw.hp} | 小怪存活=${mo.alive} HP=${mo.hp}`);
check(!mo.alive || !sw.alive, '1v1 至少一方被击杀（战斗结算正常）');

log('\n===== 场景C: 弓箭手远程风筝（射程6格, 应能在小怪接近前输出）=====');
newGameSkip(1);

X.G.turnPhase = 'action';
X.G.units.length = 0;
const ar = X.makeUnit('archer', 'player', { c: 4, r: 6 });
const mo2 = X.makeUnit('monster', 'enemy', { c: 11, r: 6 });
X.G.units.push(ar, mo2);
const moHp0 = mo2.hp;
sim(4);   // 4秒：弓箭手应已开火
log(`4秒后 小怪HP: ${moHp0} → ${mo2.hp}（弹道命中）`);
check(mo2.hp < moHp0, '弓箭手远程攻击命中敌人（弹道系统生效）');

log('\n===== 场景D: 弓箭手射程验证（6格内可攻击，超出不可）=====');
newGameSkip(1);
X.G.units.length = 0;
// 把敌人放在 7 格处，并冻结它（设 moveSpeed=0）以隔离"射程"这一个变量
const ar2 = X.makeUnit('archer', 'player', { c: 2, r: 6 });
const far = X.makeUnit('monster', 'enemy', { c: 9, r: 6 });  // 7格 > 6格射程
far.moveSpeed = 0;   // 冻结，避免它自己走进射程
X.G.units.push(ar2, far);
const farHp0 = far.hp;
sim(2);
const dTiles = Math.hypot(far.c - ar2.c, far.r - ar2.r);
log(`距离 ${dTiles.toFixed(1)} 格（射程 6 格），冻结敌人 HP: ${farHp0} → ${far.hp}`);
check(far.hp === farHp0, '超出6格射程时弓箭手不攻击');

log('\n===== 场景D2: 弓箭手在射程内应开火 =====');
newGameSkip(1);
X.G.units.length = 0;
const ar3 = X.makeUnit('archer', 'player', { c: 2, r: 6 });
const near = X.makeUnit('monster', 'enemy', { c: 7, r: 6 });  // 5格 < 6格射程
near.moveSpeed = 0;
X.G.units.push(ar3, near);
const nearHp0 = near.hp;
sim(3);
log(`距离 5 格（射程内），冻结敌人 HP: ${nearHp0} → ${near.hp}`);
check(near.hp < nearHp0, '射程内弓箭手正常开火（6格射程生效）');


/* 负面事件"二选一"模态会阻塞事件链：
   - 桩拦截时事件留在队列 → 摘除后直接结算
   - 模态打开等待时队列已空 → 直接结算并推进 */
/* newGame 会立刻推进第 1 回合的"选择援军"事件模态，模态打开时战场暂停；
   测试统一用 newGameSkip 跳过开局模态 */
function newGameSkip(id){
  X.newGame(id);
  X.closeRewardModal(); X.closeNegModal(); X.closePosModal();
  X.G.choiceOpen = false;
}
function passNeg(){
  const q = X.G.triggerQueue;
  // 先看队列（桩拦截时事件留在队列里）
  let i = q.findIndex(e => e.type === 'neg_random');
  if(i >= 0){ q.splice(i,1); X.resolveNegEvent('lose_gold'); return; }
  i = q.findIndex(e => e.type === 'pos_pick');
  if(i >= 0){ q.splice(i,1); X.resolvePosEvent('airdrop_wage'); return; }
  // 模态打开等待中（队列已空）：用本回合事件表判断是哪类弹窗
  if(X.G.turnPhase === 'event'){
    if(X.G.roundEvents.some(e => e.type === 'pos_pick')) X.resolvePosEvent('airdrop_wage');
    else X.resolveNegEvent('lose_gold');
  }
}
log('\n===== 场景E: 完整3回合流程 =====');
newGameSkip(1);

// 第1回合事件：直接选剑士，然后推进时间让流程进入行动阶段
X.resolveReward('swordsman');
sim(1.5);   // 让事件回调的 setTimeout(700ms) 触发
log(`第1回合事件结算后 turnPhase = ${X.G.turnPhase}`);
check(X.G.turnPhase === 'action', '事件结算后进入行动阶段（第1回合）');
// 召唤 + 结束回合
X.G.ap = 4;
X.beginSummon('archer');
X.tryPlaceSummon(X.BASE_TILE.c, X.BASE_TILE.r - 2);
X.endTurn();
sim(3);   // 让 endTurn 的定时器触发 startRound(2)
log(`当前回合: ${X.G.round}, 敌人数量: ${X.G.units.filter(u=>u.side==='enemy').length}`);
check(X.G.round === 2, '结束第1回合后进入第2回合');
/* 第 1 关 spawnMul = 2：配置 2 只小怪 → 实际刷 4 只。
   新流程：R2 的敌人在【第 2 回合 endTurn 时】才出现。 */
X.G.units.length = 0;          // 清掉 R1 遗留（R1 有 1 只开场垫怪，防御性清空）
X.G.ap = 4;
passNeg();
X.endTurn();                   // 第 2 回合结束 → R2 出怪（2×2=4 只小怪）
log(`第2回合endTurn后 敌人: ${X.G.units.filter(u=>u.side==='enemy').map(e=>e.typeId).join(',')}`);
check(X.G.units.filter(u=>u.side==='enemy').length === 4, '第2回合刷出4只小怪（第1关 ×2 出怪）');
// 第3回合：走完事件流程（R2出怪900ms + 敌方阶段700ms + R3事件链900ms ≈ 2.5s），结束回合后 R3 出怪
sim(3);
X.G.units.length = 0;          // 清掉 R2 的敌人，便于单独断言 R3
passNeg();
X.endTurn();
log(`第3回合endTurn后 敌人: ${X.G.units.filter(u=>u.side==='enemy').map(e=>e.typeId).join(',')}`);
const hasBoss = X.G.units.some(u => u.typeId === 'boss' && u.side === 'enemy');
check(hasBoss, '第3回合 BOSS 已出现');
// 第3回合结束：新流程下最后一波在 endTurn 时才出现，
// 需要足够时间让敌人走到基地（被打死 → 清场判胜；拆掉基地 → 判负）。
// 把基地血量压到 1，让"基地被拆 → 游戏结束"尽快确定地发生。
sim(2);
X.endTurn();
X.G.baseHp = 1;
sim(15);
log(`最终状态: phase=${X.G.phase} result=${X.G.result} 基地HP=${X.G.baseHp}`);
check(X.G.phase === 'over', '第3回合结束后游戏结束');

log('\n===== 场景F: draw() 渲染不抛异常 =====');
newGameSkip(1);

let drawErr = null;
try {
  X.buildGround();
  for (let i = 0; i < 60; i++) { clock += 16; X.update(1/60); X.draw(); }
  // 加入各种单位后再画
  X.G.units.push(X.makeUnit('swordsman','player',{c:3,r:6}));
  X.G.units.push(X.makeUnit('archer','player',{c:4,r:7}));
  X.G.units.push(X.makeUnit('miner','player',{c:5,r:2}));
  const b = X.makeUnit('boss','enemy',{c:18,r:5}); b.lv=1; X.G.units.push(b);
  X.G.units.push(X.makeUnit('monster','enemy',{c:16,r:4}));
  X.G.pendingSummon = { cardId:'swordsman' };
  X.G.selectedUnit = X.G.units[0].uid;
  X.G.hoverTile = { c:8, r:6 };
  for (let i = 0; i < 60; i++) { clock += 16; X.update(1/60); X.draw(); }
} catch (e) { drawErr = e; }
check(!drawErr, '连续渲染 120 帧无异常' + (drawErr ? '：' + drawErr.message : ''));

/* 场景F2：双路关的 2×2 矿场渲染（矿场已从 1 格扩为 4 格） */
log('\n===== 场景F2: 第 2 关矿场 4 格渲染 =====');
newGameSkip(2);
let mineDrawErr = null;
try {
  X.buildGround();
  // 4 格各塞一个矿工（最挤的渲染情形）
  for (const t of X.MINE_TILES) X.G.units.push(X.makeUnit('miner','player',{c:t.c,r:t.r}));
  // 再来一只扑矿场的破坏者
  X.G.units.push(X.makeUnit('sapper','enemy',{c:14,r:2}));
  for (let i = 0; i < 60; i++) { clock += 16; X.update(1/60); X.draw(); }
} catch (e) { mineDrawErr = e; }
check(!mineDrawErr, '矿场 4 格 + 破坏者 连续渲染 60 帧无异常' + (mineDrawErr ? '：' + mineDrawErr.message : ''));

/* 场景F3：精英 / BOSS 徽标渲染 + 登场演出期间渲染 */
log('\n===== 场景F3: 精英/BOSS 徽标与登场演出渲染 =====');
newGameSkip(3);
let introDrawErr = null;
try {
  X.buildGround();
  X.G.units.length = 0;
  X.G.units.push(X.makeUnit('warlord','enemy',{c:16,r:6}));   // 精英：橙色徽标
  X.G.units.push(X.makeUnit('overlord','enemy',{c:18,r:6}));  // BOSS：紫色徽标 + 飞行
  for (let i = 0; i < 60; i++) { clock += 16; X.update(1/60); X.draw(); }
  /* 登场演出期间（世界定格）也要能正常渲染 */
  X.queueUnitIntro(['overlord']);
  for (let i = 0; i < 60; i++) { clock += 16; X.update(1/60); X.draw(); }
  X.clearUnitIntro();
} catch (e) { introDrawErr = e; }
check(!introDrawErr, '精英/BOSS 徽标 + 登场演出渲染 120 帧无异常' + (introDrawErr ? '：' + introDrawErr.message : ''));
check(X.makeUnit('warlord','enemy',{c:16,r:6}).tier === 'elite', '单位实例带 tier 字段（精英）');
check(X.makeUnit('monster','enemy',{c:16,r:6}).tier === null, '普通怪 tier 为 null');

log('\n===== 场景G: 基地被打穿应判负 =====');
newGameSkip(1);

X.G.units.length = 0;
// 放 5 只小怪围攻
for (let i = 0; i < 5; i++) X.G.units.push(X.makeUnit('monster','enemy',{c: 3+i, r: 5+i}));
sim(120);
log(`结果: phase=${X.G.phase} result=${X.G.result} 基地HP=${X.G.baseHp}`);
check(X.G.baseHp < 20, '无防守时基地被持续攻击掉血');

log('\n===== 场景H: 升级后的士兵明显更强 =====');
// H1: Lv1 vs Lv2 各自单挑 1 只小怪，比较剩余血量
function duelAtLevel(lv) {
  newGameSkip(1);
  X.G.turnPhase = 'action';
  X.G.units.length = 0;
  const s = X.makeUnit('swordsman', 'player', { c: 10, r: 6 });
  s.lv = lv; X.applyLevel(s);
  const e = X.makeUnit('monster', 'enemy', { c: 13, r: 6 });
  X.G.units.push(s, e);
  sim(30);   // 数值相等 → 约20秒分出胜负
  return { alive: s.alive, hp: s.hp, enemyAlive: e.alive };
}
const d1 = duelAtLevel(1);
const d2 = duelAtLevel(2);
log(`Lv1剑士: 存活=${d1.alive} 剩余HP=${d1.hp} | 敌人存活=${d1.enemyAlive}`);
log(`Lv2剑士: 存活=${d2.alive} 剩余HP=${d2.hp} | 敌人存活=${d2.enemyAlive}`);
check(!d1.alive && d1.enemyAlive, 'Lv1剑士 单挑强化后的小怪落败（敌方数值 ×1.5 后更难）');
check(d2.alive && !d2.enemyAlive && d2.hp > d1.hp, 'Lv2剑士（解锁盾墙）完胜且剩余血量高于Lv1（升级有效）');

log('\n===== 场景I: 满配2v2（升级后应能守住）=====');
newGameSkip(1);
X.G.turnPhase = 'action';
X.G.units.length = 0;
const sA = X.makeUnit('swordsman','player',{c:8,r:5});  sA.lv=2; X.applyLevel(sA);
const sB = X.makeUnit('swordsman','player',{c:8,r:7});  sB.lv=2; X.applyLevel(sB);
const eA = X.makeUnit('monster','enemy',{c:13,r:5});
const eB = X.makeUnit('monster','enemy',{c:13,r:7});
X.G.units.push(sA, sB, eA, eB);
sim(30);
const enemiesLeft = X.G.units.filter(u=>u.side==='enemy').length;
log(`2个Lv2剑士 vs 2小怪 → 剩余敌人=${enemiesLeft}, 我方存活=${X.G.units.filter(u=>u.side==='player').length}`);
check(enemiesLeft === 0, '2个升级剑士可清掉2只小怪');

log('\n======================================');
log(`模拟测试: ${pass} 通过, ${fail} 失败`);
if (fail > 0) { log('存在失败项！'); process.exit(1); }
log('>>> ALL SIMULATION TESTS PASSED <<<');
