/* ============================================================
   前压防守（hold the line）专项测试
   验证：近战兵主动前出到防线、远程兵推进到支援线、
        敌人进入视野时主动迎击、玩家手动命令优先
   ============================================================ */
const fs = require('fs');
const src = fs.readFileSync('game.js', 'utf8');
const noop = () => {};
function mkCtx() {
  const st = {};
  const t = { fillRect:noop, strokeRect:noop, clearRect:noop, drawImage:noop, beginPath:noop,
    moveTo:noop, lineTo:noop, arc:noop, ellipse:noop, fill:noop, stroke:noop, closePath:noop,
    setLineDash:noop, fillText:noop, save:noop, restore:noop };
  return new Proxy(t, { get(o,k){ if(k in st) return st[k]; if(k in o) return o[k]; return ()=>{}; }, set(o,k,v){ st[k]=v; return true; } });
}
function mkEl(tag) {
  const _cls = new Set();
  const el = { tagName:tag, style:{}, children:[],
    classList:{
      add:(...c)=>c.forEach(x=>_cls.add(x)),
      remove:(...c)=>c.forEach(x=>_cls.delete(x)),
      contains:(c)=>_cls.has(c),
      toggle:(c)=>_cls.has(c)?_cls.delete(c):_cls.add(c),
    },
    _text:'', _html:'',
    get textContent(){return this._text}, set textContent(v){this._text=v},
    get innerHTML(){return this._html}, set innerHTML(v){this._html=String(v); this.children.length=0},
    appendChild(c){el.children.push(c);return c}, insertBefore(c){el.children.push(c);return c},
    removeChild:noop, remove:noop, querySelector(){return mkEl('button')}, querySelectorAll(){return[]},
    addEventListener:noop, getBoundingClientRect:()=>({left:0,top:0,width:1232,height:728}),
    scrollTop:0, scrollHeight:0, disabled:false, onclick:null, getContext:()=>mkCtx(), width:1232, height:728 };
  return el;
}
const reg = {};
global.document = { getElementById:id=>{ if(!reg[id]) reg[id]=mkEl('div'); return reg[id]; }, createElement:t=>mkEl(t), addEventListener:noop, body:mkEl('body') };
/* 战场测试：把三屏菜单全部置为 hidden，否则 update() 会被菜单态冻结 */
function hideMenus(){
  for(const id of ['title-screen','level-select','briefing','overlay','help-overlay'])
    global.document.getElementById(id).classList.add('hidden');
}
hideMenus();
global.window = { addEventListener:noop };
let clock = 0;
global.performance = { now:()=>clock };
const timers = [];
global.setTimeout = (f,ms)=>{ timers.push({f, at:clock+(ms||0)}); return timers.length; };
global.requestAnimationFrame = noop;

/* ---- 固定随机数：消除随机负面事件/随机攻击冷却造成的用例抖动 ---- */
let _seed = 20261010;
Math.random = function(){
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
};

const body = src + `
;return {
  update, makeUnit, newGame, aStar, nearestFreeTile, occupiedAt, commandMove,
  LINE_COL, SUPPORT_COL, LINE_TOLERANCE, ENGAGE_RANGE, BASE_TILE, BASE, TILE,
  closeRewardModal, closeNegModal, closePosModal,
  get G(){ return G; }
};`;
const X = new Function('document','window','performance','requestAnimationFrame','setTimeout', body)(
  global.document, global.window, global.performance, global.requestAnimationFrame, global.setTimeout);
hideMenus();   // 构造后再隐藏一次（模块启动会把标题屏 show 出来）

/* 前压/test 场景统一用第一关（无地形岩壁），隔离"前压逻辑"这一个变量 */
const LV_TEST = 1;
/* 第一关为单路开阔地图，取 r6 作为主战场行 */
const ROW = 6;

const log = (...a) => console.log(...a);
let pass = 0, fail = 0;
const check = (c, m) => { if (c) { pass++; log('  ✓ ' + m); } else { fail++; log('  ✗ FAIL: ' + m); } };
/* newGame 会立刻弹出第 1 回合的"选择援军"模态，模态期间战场暂停（G.choiceOpen）；
   测试里统一用它跳过开局模态，否则 update() 会被守卫拦住、单位永远不动 */
function newGameSkip(id){
  X.newGame(id);
  X.closeRewardModal(); X.closeNegModal(); X.closePosModal();
  X.G.choiceOpen = false;
}
function sim(sec, step=1/60){
  const n = Math.round(sec/step);
  for(let i=0;i<n;i++){ clock += step*1000; X.update(step); }
}

log('===== 防线配置 =====');
log(`近战防线 col=${X.LINE_COL}, 远程支援线 col=${X.SUPPORT_COL}, 视野=${X.ENGAGE_RANGE}格`);
check(X.LINE_COL > 2 && X.LINE_COL < 15, '防线位于基地与刷怪区之间（地图中部）');
check(X.SUPPORT_COL < X.LINE_COL, '支援线在近战防线之后');
check(X.BASE.swordsman.holdLine === true, '剑士标记为镇守前线');
check(X.BASE.shield.holdLine === true, '盾卫标记为镇守前线');
check(X.BASE.berserker.holdLine === true, '狂战士标记为镇守前线（数值保留）');
check(!X.BASE.archer.holdLine, '弓箭手不当前排（走支援线）');

log('\n===== 场景1: 剑士无敌情时主动前出到防线 =====');
newGameSkip(LV_TEST);
X.G.turnPhase = 'action';
X.G.units.length = 0;
const sw = X.makeUnit('swordsman','player',{c:3,r:6});
X.G.units.push(sw);
log(`初始: 剑士在 col=${sw.c}, 目标防线 col=${X.LINE_COL}`);
sim(12);
log(`12秒后: 剑士在 col=${sw.c} (r=${sw.r})`);
check(sw.c >= X.LINE_COL - X.LINE_TOLERANCE, `剑士已前出至防线附近 (col=${sw.c} >= ${X.LINE_COL - X.LINE_TOLERANCE})`);
check(sw.c <= X.LINE_COL + X.LINE_TOLERANCE, '剑士未越过防线');

log('\n===== 场景2: 弓箭手推进到支援线而非前线 =====');
newGameSkip(LV_TEST);
X.G.turnPhase = 'action';
X.G.units.length = 0;
const ar = X.makeUnit('archer','player',{c:3,r:6});
X.G.units.push(ar);
sim(20);
log(`20秒后: 弓箭手在 col=${ar.c}`);
check(ar.c >= X.SUPPORT_COL - X.LINE_TOLERANCE, `弓箭手推进至支援线附近 (col=${ar.c})`);
check(ar.c < X.LINE_COL, '弓箭手留在近战防线之后（不当前排）');

log('\n===== 场景3: 敌人出现 → 近战兵主动迎击 =====');
newGameSkip(LV_TEST);
X.G.turnPhase = 'action';
X.G.units.length = 0;
const sw2 = X.makeUnit('swordsman','player',{c:3,r:6});
X.G.units.push(sw2);
sim(3);   // 先让它前出一点
const beforeCol = sw2.c;
// 在视野内放一只敌人
const mo = X.makeUnit('monster','enemy',{c:X.LINE_COL+3,r:6});
X.G.units.push(mo);
const moStartCol = mo.c;
const moHp0 = mo.hp;                 // 记录初始血量（小怪基准已随 ×1.5 调整，不能再硬编码 20）
sim(9);
log(`剑士 col ${beforeCol} → ${sw2.c}；小怪 col ${moStartCol} → ${mo.c}`);
const gap = Math.hypot(sw2.c-mo.c, sw2.r-mo.r);
check(sw2.c > beforeCol || gap <= 2.5, '剑士主动向敌人靠拢迎击');
check(mo.hp < moHp0 || !mo.alive, `剑士已与敌人交战（敌人掉血 ${moHp0} → ${mo.hp}）`);

log('\n===== 场景4: 玩家手动命令优先于自动前压 =====');
newGameSkip(LV_TEST);
X.G.turnPhase = 'action';
X.G.ap = 4;
X.G.units.length = 0;
const sw3 = X.makeUnit('swordsman','player',{c:3,r:3});
X.G.units.push(sw3);
// 玩家命令它去右下角（远离防线）
X.commandMove(sw3, 3, 10);
check(sw3.manualOrder === true, '下达命令后标记为手动指挥');
sim(15);
log(`手动命令(去 col3,row10)后: 剑士在 (${sw3.c},${sw3.r})`);
check(sw3.r >= 8, '剑士服从手动命令前往指定位置，未回撤到防线');

log('\n===== 场景5: 手动命令执行完毕后恢复自动前压 =====');
// 将其复位到防线左侧，清掉手动标记，让它重新前压
sw3.manualOrder = false;
sw3.c = 3; sw3.r = 6;
const cp = { x:3*56+28, y:6*56+28 }; sw3.x=cp.x; sw3.y=cp.y;
sim(12);
log(`恢复自动后: 剑士在 col=${sw3.c}`);
check(sw3.c >= X.LINE_COL - X.LINE_TOLERANCE, '解除手动标记后重新自动前压到防线');

log('\n===== 场景6: 矿工不受前压逻辑影响 =====');
newGameSkip(LV_TEST);
X.G.turnPhase = 'action';
X.G.units.length = 0;
const mn = X.makeUnit('miner','player',{c:2,r:5});
X.G.units.push(mn);
sim(15);
log(`15秒后: 矿工在 (${mn.c},${mn.r})`);
check(mn.c === 2 && mn.r === 5, '矿工原地不动（不参与前压）');

log('\n===== 场景7: 前排剑士实际能替基地挡伤害 =====');
newGameSkip(LV_TEST);
X.G.turnPhase = 'action';
X.G.units.length = 0;
const body2 = X.makeUnit('swordsman','player',{c:3,r:6});
X.G.units.push(body2);
sim(4);   // 前出
const baseHpBefore = X.G.baseHp;
const mobs = [];
for(let i=0;i<3;i++){
  const m = X.makeUnit('monster','enemy',{c:16,r:5+i*1.5|0});
  X.G.units.push(m); mobs.push(m);
}
sim(35);
const aliveMobs = X.G.units.filter(u=>u.side==='enemy').length;
log(`35秒后: 基地HP=${X.G.baseHp}, 剑士存活=${body2.alive}, 剩余敌人=${aliveMobs}`);
check(body2.c > 5, '剑士前出到中场接敌（未龟缩基地）');
check(X.G.baseHp <= baseHpBefore, '基地受到的威胁被前排分担（战斗在中场发生）');

log('\n======================================');
log(`前压防守测试: ${pass} 通过, ${fail} 失败`);
if (fail > 0) { log('存在失败项！'); process.exit(1); }
log('>>> ALL FRONTLINE TESTS PASSED <<<');
