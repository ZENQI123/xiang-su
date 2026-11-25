/* ============================================================
   UI 流程测试：标题 → 选关 → 简报 → 战场
   ------------------------------------------------------------
   验证「选关之后再触发游戏」的完整链路与状态机。
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
/* 带真实 classList 行为的元素 */
function mkEl(id, tag) {
  const classes = new Set();
  const el = {
    id: id || '',
    _tag: tag || 'div',
    style: {},
    children: [],
    _text: '', _html: '',
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      contains: (c) => classes.has(c),
      toggle: (c) => classes.has(c) ? classes.delete(c) : classes.add(c),
      _set: classes,
    },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); this.children.length = 0; },   // 真实 DOM：innerHTML='' 会清空子节点
    /* className 与 classList 联动（真实 DOM 行为） */
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(x => classes.add(x)); },
    appendChild(c) { c.parentNode = this; this.children.push(c); registerTree(c); return c; },
    insertBefore(c, ref) {
      /* 真实 DOM：ref 不是 this 的子节点时抛 NotFoundError。
         必须照实模拟——否则"插错父节点"这类 bug 会被静默吞掉。 */
      if (ref !== undefined && ref !== null && this.children.indexOf(ref) < 0) {
        const e = new Error('Failed to execute \'insertBefore\' on \'Node\': The node before which the new node is to be inserted is not a child of this node.');
        e.name = 'NotFoundError';
        throw e;
      }
      c.parentNode = this;
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i >= 0) this.children.splice(i, 0, c); else this.children.push(c);
      registerTree(c); return c;
    },
    remove() {
      if (this.parentNode) {
        const i = this.parentNode.children.indexOf(this);
        if (i >= 0) this.parentNode.children.splice(i, 1);
      }
      if (this.id && byId[this.id] === this) delete byId[this.id];
      this.parentNode = null;
    },
    /* 支持 .class 选择器：优先在真实子节点树里找；
       找不到时返回一个"新建桩元素"——因为卡牌等元素是用 innerHTML 字符串
       生成的，桩里并没有解析出子节点，但游戏代码需要拿到可挂事件的节点。
       也支持 '.cls tag' 这类后代选择器（如 '.shop-title span'）。 */
    querySelector(sel) {
      if (typeof sel === 'string' && sel[0] === '.') {
        const m = sel.match(/^\.([\w-]+)(?:\s+([\w-]+))?$/);
        if (m) {
          const wantCls = m[1], wantTag = m[2];
          const walk = (n, depth) => {
            for (const c of (n.children || [])) {
              if (c.classList && c.classList.contains(wantCls)) {
                if (!wantTag) return c;
                /* 后代选择器：在命中节点内部再找 tag 名匹配的子元素 */
                const inner = findTag(c, wantTag);
                if (inner) return inner;
              }
              const r = walk(c, depth + 1); if (r) return r;
            }
            return null;
          };
          const hit = walk(this, 0);
          if (hit) return hit;
        }
      }
      return mkEl();
    },
    addEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1232, height: 728 }),
    scrollTop: 0, scrollHeight: 0, disabled: false,
    getContext: () => mkCtx(),
    width: 0, height: 0,
    onclick: null,
  };
  return el;
}

const registry = {};
/* 动态挂到 DOM 上的元素（如 #reward-choices）也应按 id 被检索到——
   真实 DOM 的 getElementById 会扫全文档，这里用一个 id 索引模拟。 */
const byId = {};
function registerTree(node){
  if(node && node.id) byId[node.id] = node;
  if(node && node.children) node.children.forEach(registerTree);
}
/* 在节点子树里按 tag 名找元素（桩用 _tag 记录标签名，如 'span'） */
function findTag(node, tag){
  for(const c of (node.children || [])){
    if(c._tag === tag) return c;
    const r = findTag(c, tag); if(r) return r;
  }
  return null;
}
global.document = {
  getElementById: (id) => {
    if (byId[id]) return byId[id];
    if (!registry[id]) registry[id] = mkEl(id);
    return registry[id];
  },
  createElement: () => mkEl(),
  addEventListener: noop,
};
/* 镜像 index.html 的初始 class，使 contains('hidden') 判断与真实页面一致 */
const INIT_HIDDEN = ['level-select','briefing','overlay','help-overlay'];
const INIT_VISIBLE = ['title-screen'];
for(const id of INIT_HIDDEN) global.document.getElementById(id).classList.add('hidden');
for(const id of INIT_VISIBLE) global.document.getElementById(id).classList.remove('hidden');

/* ---- 还原 index.html 里 #overlay 的真实嵌套结构 ----
   #overlay-btn 的父节点是 .overlay-btns（不是 #overlay-box）。
   若桩里三者互不关联，insertBefore 的"ref 必须是子节点"校验就形同虚设，
   会漏掉真实浏览器里抛 NotFoundError 的 bug。 */
(function buildOverlayTree(){
  const box  = global.document.getElementById('overlay-box');
  const btns = mkEl('');  btns.classList.add('overlay-btns');
  const mkBtn = (id, cls) => { const b = mkEl(id); if(cls) b.classList.add(cls); btns.appendChild(b); return b; };
  mkBtn('overlay-next', 'next');
  mkBtn('overlay-btn', 'alt');
  mkBtn('overlay-retry', 'alt');
  box.appendChild(btns);
})();

/* ---- 还原 index.html 里 #shop-panel 的真实嵌套结构 ----
   #shop-panel > .panel-title.shop-title > span（标题文字）
   游戏用 panel.querySelector('.shop-title span').textContent 改写标题，
   桩若没有这层结构就拿不到节点、只能拿到新建空元素，断言会误判。 */
(function buildShopTree(){
  const panel = global.document.getElementById('shop-panel');
  const title = mkEl('', 'div');
  title.classList.add('panel-title'); title.classList.add('shop-title');
  const span = mkEl('', 'span');
  title.appendChild(span);
  panel.appendChild(title);
  panel.appendChild(global.document.getElementById('shop-list'));
  panel.appendChild(global.document.getElementById('btn-refresh'));
})();
const keyHandlers = [];
global.window = { addEventListener: (ev, fn) => { if (ev === 'keydown') keyHandlers.push(fn); } };
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = noop;

let _hold = false;
const _timers = [];
global.setTimeout = (f) => { if (!f) return 0; if (_hold) { _timers.push(f); return 0; } f(); return 0; };
/* 真实浏览器有 clearTimeout；enterBattle / startBriefing 都会调用它。
   不补这个桩会让 enterBattle 在首行抛 ReferenceError 并静默中断。 */
global.clearTimeout = () => {};
function holdTimers(on) { _hold = !!on; if (!on) { const q = _timers.splice(0); q.forEach(f => f()); } }

/* localStorage 桩：验证通关进度持久化 */
const _lsStore = {};
global.localStorage = {
  getItem: (k) => (k in _lsStore ? _lsStore[k] : null),
  setItem: (k, v) => { _lsStore[k] = String(v); },
  removeItem: (k) => { delete _lsStore[k]; },
};

const body = src + `
;return {
  G_get: ()=>G, CLEARED, saveCleared,
  showLevelSelect, backToTitle, backToLevelSelect, buildLevelSelect,
  startBriefing, enterBattle, restart, newGame,
  LEVEL_CONFIGS, CURRENT_LEVEL_get: ()=>CURRENT_LEVEL,
  bindButtons, updateUI, endGame, refreshTitleProgress,
  openRewardModal, resolveReward, closeRewardModal,
  openTalentDetail, closeTalentDetail,
  refreshShop, buildShopPool, buyShopItem, renderShop,
  isLevelUnlocked, maxUnlockedLevel, nextLevelId, levelIds,
  CLEAR_SAVE_KEY,
  setBriefActive: (v)=>{ briefingActive = v; },
  inMenuScreen,
  get G(){ return G; }
};`;
const X = new Function('document','window','performance','requestAnimationFrame','setTimeout','clearTimeout', body)(
  global.document, global.window, global.performance, global.requestAnimationFrame, global.setTimeout, global.clearTimeout);

const log = (...a) => console.log(...a);
let pass = 0, fail = 0;
function check(cond, msg) { if (cond) { pass++; log('  ✓ ' + msg); } else { fail++; log('  ✗ FAIL: ' + msg); } }
function section(t){ log('\n===== ' + t + ' ====='); }
const el = (id) => global.document.getElementById(id);   // 与真实取元素方式一致（含动态挂载节点）
const hidden = (id) => el(id).classList.contains('hidden');
/* 取某个关卡卡片（按渲染顺序，与 levelIds() 同序） */
const cardAt = (i) => el('level-cards').children[i];
const cardHtmlAll = () => el('level-cards').children.map(c => c.innerHTML).join('\n');
const clearAll = () => { for(const k in X.CLEARED) delete X.CLEARED[k]; };

/* 手动重建按钮绑定（因为测试没有自动启动流程） */
X.bindButtons();

section('1. 启动状态：停在标题界面');
check(!hidden('title-screen'), '标题界面可见');
check(hidden('level-select'), '选关界面隐藏');
check(hidden('briefing'), '简报界面隐藏');
check(X.inMenuScreen() === true, 'inMenuScreen() = true（战场冻结）');

section('2. 标题 → 选关');
X.showLevelSelect();
check(hidden('title-screen'), '标题界面已隐藏');
check(!hidden('level-select'), '选关界面可见');
check(el('level-cards').children.length === 5, `选关卡片数量 = 5（实际 ${el('level-cards').children.length}）`);
check(X.inMenuScreen() === true, 'inMenuScreen() 仍为 true');

/* ============================================================ */
section('2.5 解锁机制：仅第 1 关开放');
clearAll();
X.backToLevelSelect();
check(X.levelIds().length === 5, '共 5 关');
check(X.isLevelUnlocked(1) === true, '第 1 关默认解锁');
check(X.isLevelUnlocked(2) === false, '第 2 关初始锁定（未通关第 1 关）');
check(X.isLevelUnlocked(3) === false, '第 3 关初始锁定');
check(X.maxUnlockedLevel() === 1, '当前最大可玩关卡 = 1');

const html2 = cardHtmlAll();
check(cardAt(1).classList.contains('locked'), '第 2 关卡片带 locked 样式');
check(html2.includes('🔒 未解锁'), '第 2 关显示「🔒 未解锁」徽章');
check(html2.includes('通关「第 1 关」后解锁'), '第 2 关提示解锁条件');

/* 点锁定的卡片 → 不能进入简报 */
X.startBriefing(X.LEVEL_CONFIGS[2]);
check(hidden('briefing'), '点击锁定关卡不进入简报');
check(!hidden('level-select'), '仍停留在选关界面');

section('2.6 先通关第 1 关 → 第 2 关解锁');
X.CLEARED[1] = true;
X.saveCleared();
check(X.isLevelUnlocked(2) === true, '通关第 1 关后第 2 关解锁');
check(X.maxUnlockedLevel() === 2, '最大可玩关卡 = 2');
check(X.nextLevelId(1) === 2, '第 1 关的下一关 = 2');
check(X.nextLevelId(2) === 3, '第 2 关的下一关 = 3');
check(X.nextLevelId(3) === 4, '第 3 关的下一关 = 4');
check(X.nextLevelId(4) === 5, '第 4 关的下一关 = 5');
check(X.nextLevelId(5) === null, '第 5 关（最后一关）没有下一关');
X.backToLevelSelect();
const html3 = cardHtmlAll();
check(!cardAt(1).classList.contains('locked'), '第 2 关不再是 locked 样式');
check(html3.includes('★ 已通关'), '第 1 关显示「★ 已通关」徽章');
check(html3.includes('开始 ▶'), '第 2 关可点击（显示「开始 ▶」）');

section('2.7 通关进度持久化到 localStorage');
const raw = global.localStorage.getItem(X.CLEAR_SAVE_KEY);
check(!!raw, 'localStorage 已写入通关记录');
check(raw.includes('"1":true'), '记录内容含 level 1 通关');
/* 模拟刷新：重新构造一个模块实例，读同一个 localStorage。
   注意：新实例的启动段会把标题屏 show 出来，而它与 X 共用同一套 DOM 桩，
   所以要把它对界面的副作用还原，避免污染后续断言。 */
const X2 = new Function('document','window','performance','requestAnimationFrame','setTimeout','clearTimeout', body)(
  global.document, global.window, global.performance, global.requestAnimationFrame, global.setTimeout, global.clearTimeout);
check(X2.CLEARED[1] === true, '重新加载后仍记得第 1 关已通关');
check(X2.isLevelUnlocked(2) === true, '重新加载后第 2 关仍解锁');
/* 还原 X2 启动造成的界面变化 */
hidden('title-screen') || el('title-screen').classList.add('hidden');
/* ⚠ X2 与 X 共用同一套 DOM 桩，它的启动段会调用 bindButtons()，
   把 #briefing / #btn-start 等 onclick 覆盖成"属于 X2 的闭包"。
   之后再触发点击，跑的是 X2 的处理函数、读的是 X2 的 briefingActive，
   而断言查的却是 X 的状态 —— 两边对不上，测试就会莫名其妙失败。
   这里把按钮重新绑回 X，确保后续交互都作用在 X 上。 */
X.bindButtons();

section('3. 点击关卡卡 → 简报（不立即开打）');
X.startBriefing(X.LEVEL_CONFIGS[2]);
check(hidden('level-select'), '选关界面已隐藏');
check(!hidden('briefing'), '简报界面可见');
check(el('brief-stage').textContent === 'STAGE 2', '简报显示 STAGE 2');
check(el('brief-name').textContent === '双路守卫', '简报显示关卡名「双路守卫」');
check(el('brief-tags').innerHTML.includes('双路地图'), '简报标签含「双路地图」');
check(el('brief-tags').innerHTML.includes('商店开放'), '简报标签含「商店开放」');
check(X.inMenuScreen() === true, 'inMenuScreen() = true（简报期间冻结）');

section('4. 简报 → 进入战场');
const beforeRound = X.G.round;
X.enterBattle(X.LEVEL_CONFIGS[2]);
holdTimers(false);   // 冲洗 enterBattle 的 setTimeout
check(hidden('briefing'), '简报界面已隐藏');
check(X.CURRENT_LEVEL_get() === 2, '当前关卡 = 2');
check(X.G.lv.id === 2, '游戏状态已切到第 2 关');
check(X.G.baseHpMax === 30, '第 2 关基地 = 30 血');
check(X.G.apMax === 5, '第 2 关行动值 = 5');
check(X.G.round === 1, '重开后回到第 1 回合');
check(X.inMenuScreen() === false, 'inMenuScreen() = false（战场已激活）');
section('5. 第 1 关走同一条链路');
X.backToLevelSelect();
check(!hidden('level-select'), '返回选关界面可见');
X.startBriefing(X.LEVEL_CONFIGS[1]);

check(el('brief-name').textContent === '守卫基地', '简报显示「守卫基地」');
check(el('brief-tags').innerHTML.includes('出怪 ×2'), '第 1 关简报标签含「出怪 ×2」');
check(el('brief-tags').innerHTML.includes('商店开放'), '第 1 关简报标签含「商店开放」');
X.enterBattle(X.LEVEL_CONFIGS[1]);
holdTimers(false);
check(X.G.lv.id === 1, '切到第 1 关');
check(X.G.baseHpMax === 20, '第 1 关基地 = 20 血');
check(X.G.apMax === 4, '第 1 关行动值 = 4');

/* ============================================================ */
section('5.0 第 1 关商店面板：显示 + 不出新兵种 + 可买升级');
X.G.turnPhase = 'action'; X.G.gold = 100; X.G.ap = 4;
X.updateUI();
const shopPanel1 = el('shop-panel');
check(shopPanel1.style.display !== 'none', '第 1 关商店面板可见（曾因 hasShop=false 被隐藏）');
X.refreshShop(0, true);
const slotKinds = X.G.shop.slots.map(s => s.kind);
check(!slotKinds.includes('card'), `第 1 关货架不含新兵种（实际：${slotKinds.join(',')}）`);
check(slotKinds.length > 0, '第 1 关货架有货（升级卡 / 补给）');
/* 面板标题提示"不含新兵种" */
const shopTitleEl = shopPanel1.querySelector('.shop-title span');
check(shopTitleEl.textContent.includes('升级'), `第 1 关商店标题明示只卖升级/补给（"${shopTitleEl.textContent}"）`);

/* 对照：第 2 关商店标题回到「常驻」，且货架可能含新兵种 */
X.newGame(2); X.G.turnPhase = 'action'; X.updateUI();
check(el('shop-panel').querySelector('.shop-title span').textContent.includes('常驻'),
  '对照：第 2 关商店标题为「常驻」');
X.newGame(1); X.G.turnPhase = 'action';

/* ============================================================ */
section('5.1 回归：点简报进场必须是"玩家选的那一关"（曾误进第 1 关）');
/* 背景：简报入场原本写 enterBattle(LEVEL_CONFIGS[CURRENT_LEVEL])，
   而 CURRENT_LEVEL 只在入场后才更新 —— 玩家在选关界面选第 2 关时，
   简报正确显示第 2 关，但点进场读到的仍是旧的 CURRENT_LEVEL(=1)，
   于是"选第 2 关却进了第 1 关"。
   修法：startBriefing 记住 briefLevelId，简报点击用 briefLevelId 入场。 */

/* 先把 CURRENT_LEVEL 停在 1（模拟：刚从第 1 关退出来，或首次进游戏） */
X.newGame(1);
check(X.CURRENT_LEVEL_get() === 1, '前置：CURRENT_LEVEL 停在 1');

/* 走真实链路选第 2 关：开始游戏 → 点关卡卡 → 点简报 */
X.CLEARED[1] = true; X.saveCleared();          // 解锁第 2 关
X.backToTitle();
el('btn-start').onclick();                      // 标题 → 选关
X.startBriefing(X.LEVEL_CONFIGS[2]);            // 点第 2 关卡片
check(el('brief-name').textContent === '双路守卫', '简报显示的是第 2 关《双路守卫》');
check(el('brief-stage').textContent === 'STAGE 2', '简报 STAGE 标注为 2');
el('briefing').onclick();                       // 点简报入场（真实 onclick）
holdTimers(false);
check(X.CURRENT_LEVEL_get() === 2, '入场后 CURRENT_LEVEL = 2');
check(X.G.lv.id === 2, '⛔ 关键：真的进入第 2 关（曾误进第 1 关）');
check(X.G.baseHpMax === 30, '第 2 关基地 = 30 血（不是第 1 关的 20）');
check(X.G.apMax === 5, '第 2 关行动值 = 5（不是第 1 关的 4）');
check(X.G.lv.hasLanes === true, '第 2 关是双路地图');

/* 反向验证：选第 1 关时同样要进第 1 关 */
X.newGame(2);
X.backToTitle();
el('btn-start').onclick();
X.startBriefing(X.LEVEL_CONFIGS[1]);
check(el('brief-name').textContent === '守卫基地', '简报显示第 1 关');
el('briefing').onclick();
holdTimers(false);
check(X.G.lv.id === 1, '选第 1 关就进第 1 关（不会粘在上一关）');
check(X.G.baseHpMax === 20, '第 1 关基地 = 20 血');

/* ============================================================ */
section('5.5 回归：第 1 回合 reward_pick 必须真正弹出三选一');
/* 背景：newGame 启动段预创建状态时仍停在标题界面，若此时派发第 1 回合
   事件链，openRewardModal 会被 inMenuScreen() 守卫拦掉；而 runEvent
   对 reward_pick 是 `return`（等玩家选择），一旦被拦就会连事件链一起
   吞掉 → 回合永远卡在「事件处理中…」，且看不到任何选项。
   修法：(a) 菜单态不派发事件链；(b) 被拦时把事件放回队首重试。 */

/* --- 5.5.1 菜单态 newGame 不派发事件链 --- */
X.backToTitle();
check(X.inMenuScreen() === true, '回到标题界面，inMenuScreen()=true');
X.newGame(1);
check(X.G.turnPhase === 'event', '菜单态 newGame 后仍停在事件阶段');
check(X.G.triggerQueue.length === 0, '菜单态不把第 1 回合事件放进队列（避免被守卫吞掉）');
check(el('overlay').classList.contains('hidden'), '标题界面下不弹出奖励弹窗');

/* --- 5.5.2 进入战场后事件链正常推进并弹出选项 --- */
X.startBriefing(X.LEVEL_CONFIGS[1]);
X.enterBattle(X.LEVEL_CONFIGS[1]);
holdTimers(false);
check(!hidden('overlay'), '进入战场后奖励弹窗弹出');
check(el('overlay-title').textContent.includes('援军抵达'), '弹窗标题为「事件 · 援军抵达」');
const rewardWrap = el('overlay-box').children.filter(c => c.id === 'reward-choices');
check(rewardWrap.length === 1, `三选一容器恰好 1 个（实际 ${rewardWrap.length}，防止重复弹出）`);
check(rewardWrap[0].children.length === 3, `提供 3 个兵种选项（实际 ${rewardWrap[0].children.length}）`);
const choiceText = rewardWrap[0].children.map(b => b.innerHTML).join(' ');
check(choiceText.includes('剑士') && choiceText.includes('弓箭手') && choiceText.includes('矿工'),
  '三个选项分别是 剑士 / 弓箭手 / 矿工');

/* 每个士兵选项的介绍都必须写明攻击距离（统一走 unitStatLine） */
const optEls = rewardWrap[0].children;
const swTip = (optEls.find(b => b.innerHTML.includes('剑士')) || {}).innerHTML || '';
const arTip = (optEls.find(b => b.innerHTML.includes('弓箭手')) || {}).innerHTML || '';
const mnTip = (optEls.find(b => b.innerHTML.includes('矿工')) || {}).innerHTML || '';
check(swTip.includes('攻击距离 1 格'), '剑士选项介绍写明攻击距离（1 格）');
check(arTip.includes('攻击距离 6 格'), '弓箭手选项介绍写明攻击距离（6 格）');
check(mnTip.includes('无攻击'), '矿工选项介绍标注无攻击');

/* --- 5.5.3 点选项按钮 → 关闭弹窗并继续事件链（走真实点击链路） --- */
const optBtns = rewardWrap[0].children;
const archerBtn = optBtns.find(b => b.innerHTML.includes('弓箭手'));
check(!!archerBtn && typeof archerBtn.onclick === 'function', '弓箭手选项绑定了点击处理');
archerBtn.onclick();
holdTimers(false);
check(el('overlay').classList.contains('hidden'), '选择后弹窗关闭');
check(el('overlay-box').children.filter(c => c.id === 'reward-choices').length === 0,
  '选择后三选一容器被清理');
check(X.G.units.some(u => u.side === 'player' && u.typeId === 'archer'),
  '奖励的弓箭手已加入战场');

/* --- 5.5.4 openRewardModal 在菜单态返回 false（供 runEvent 判断） --- */
X.backToTitle();
check(X.openRewardModal(['swordsman','archer','miner']) === false,
  '菜单态调用 openRewardModal 返回 false（不静默失败）');

/* --- 5.5.5 回归：选项容器必须插到 #overlay-box 的直接子节点引用上 ---
   曾经的写法是 box.insertBefore(wrap, $('overlay-btn'))，但 #overlay-btn 的
   父节点是 .overlay-btns 而非 #overlay-box → 真实浏览器抛 NotFoundError，
   函数在 ov.classList.remove('hidden') 之前中断：横幅已显示、选项却出不来。
   （Node 桩原先的 insertBefore 不校验父节点，所以漏掉了这个 bug。） */
section('5.5.5 回归：insertBefore 的参照节点必须是同一父节点的子元素');
X.backToTitle();
X.showLevelSelect();                 // 标题 → 选关
X.startBriefing(X.LEVEL_CONFIGS[1]); // 点关卡卡 → 简报
X.enterBattle(X.LEVEL_CONFIGS[1]);   // 点简报 → 入场（内部 260ms 定时器）
holdTimers(false);
check(X.inMenuScreen() === false, '已进入战场');
check(el('overlay-title').textContent.includes('援军抵达'), '标题已写入（弹窗主流程走到最后）');
check(!el('overlay').classList.contains('hidden'),
  '⛔ 关键：弹窗真的显示出来（曾因 insertBefore 抛错而卡在半途）');
const rw = el('overlay-box').children.find(c => c.id === 'reward-choices');
check(!!rw, '选项容器已挂到 #overlay-box 下');
check(rw && rw.parentNode === el('overlay-box'), '选项容器的父节点就是 #overlay-box');
const btnsEl = el('overlay-box').children.find(c => c.classList.contains('overlay-btns'));
check(!!btnsEl && rw && btnsEl.children.indexOf(rw) < 0,
  '选项容器是按钮组的兄弟节点（不插进按钮组内部）');
check(btnsEl && btnsEl.parentNode === el('overlay-box'), '按钮组的父节点是 #overlay-box');
check(el('overlay-btn').style.display === 'none', '「返回选关」按钮被隐藏（改用卡片按钮）');
/* 收尾：清掉本次弹窗，避免影响后续小节 */
X.closeRewardModal();

section('6. 通关记录 → 选关界面显示 ★');
X.CLEARED[2] = true;
X.backToLevelSelect();
const cards = el('level-cards').children;
const htmlAll = cards.map(c => c.innerHTML).join('');
check(htmlAll.includes('已通关'), '选关界面显示「★ 已通关」徽章');
check(htmlAll.includes('最佳：已守住基地'), '选关界面显示最佳记录');
check(cards.length === 5, '仍有 5 张卡片');

/* ============================================================ */
section('6.5 结算面板：通关后出现「进入下一关」');
clearAll();
X.newGame(1);
X.G.phase = 'playing';
X.endGame('win');
check(X.CLEARED[1] === true, '通关第 1 关写入记录');
check(!hidden('overlay'), '结算面板弹出');
check(el('overlay-title').textContent.includes('新关卡解锁'), '标题提示「新关卡解锁」');
check(el('overlay-desc').innerHTML.includes('已解锁：第 2 关'), '描述里标出解锁的第 2 关');
const nb = el('overlay-next');
check(nb.style.display !== 'none', '「进入下一关」按钮可见');
check(nb.textContent.includes('第 2 关'), '按钮文案指向第 2 关');

section('6.6 最后一关通关：不显示「进入下一关」');
clearAll();
X.CLEARED[1] = true; X.CLEARED[2] = true; X.CLEARED[3] = true; X.CLEARED[4] = true;   // 先解锁到第 5 关
X.newGame(5);
X.G.phase = 'playing';
X.endGame('win');
check(el('overlay-next').style.display === 'none', '第 5 关（最后一关）通关后无「进入下一关」按钮');
check(!el('overlay-title').textContent.includes('新关卡解锁'), '标题不提示解锁（已是最后一关）');

section('6.6.1 第 2 关通关：可进入第 3 关');
clearAll();
X.CLEARED[1] = true;
X.newGame(2);
X.G.phase = 'playing';
X.endGame('win');
check(el('overlay-next').style.display !== 'none', '第 2 关通关后「进入下一关」按钮可见');
check(el('overlay-next').textContent.includes('第 3 关'), '按钮文案指向第 3 关');
check(el('overlay-desc').innerHTML.includes('已解锁：第 3 关'), '描述里标出解锁的第 3 关');

section('6.7 失败时不显示「进入下一关」');
clearAll();
X.newGame(1);
X.G.phase = 'playing';
X.G.baseHp = 0;
X.endGame('lose');
check(el('overlay-next').style.display === 'none', '失败时无「进入下一关」按钮');
check(X.CLEARED[1] === undefined, '失败不写入通关记录');

section('6.8 卡面「攻击距离」用线性升级口径（每级 +0.5 倍）');
clearAll();
X.newGame(2);
X.G.turnPhase = 'action';
X.G.cards.archer.lv = 3;
X.updateUI();
const battleCards = () => el('card-list').children.map(c => c.innerHTML).join('\n');
check(battleCards().includes('攻击距离 <b>12</b> 格'),
  `Lv3 弓箭手卡面显示「攻击距离 12 格」（复利旧口径会是 13.5）`);
X.G.cards.archer.lv = 2;
X.updateUI();
check(battleCards().includes('攻击距离 <b>9</b> 格'), 'Lv2 弓箭手卡面显示「攻击距离 9 格」');
X.G.cards.archer.lv = 1;
X.updateUI();
check(battleCards().includes('攻击距离 <b>6</b> 格'), 'Lv1 弓箭手卡面仍是 6 格（未升级不受影响）');
/* 天赋详情面板同样口径 */
X.G.cards.archer.lv = 3;
X.openTalentDetail('archer');
check(el('overlay-desc').innerHTML.includes('攻击距离 12 格'),
  '天赋详情面板也按 12 格显示（与卡面一致）');
X.closeTalentDetail();

section('7. 返回标题');
X.CLEARED[1] = true;      // 造一条记录，验证标题进度显示
X.saveCleared();
X.backToTitle();
check(!hidden('title-screen'), '回到标题界面');
check(hidden('level-select'), '选关界面隐藏');
check(!hidden('ts-progress'), '标题显示通关进度');
const prog = el('ts-progress').innerHTML;
check(/进度.*\/\s*5\s*关通关|全部\s*5\s*关通关/.test(prog), `进度文案含通关数（"${prog}"）`);
check(/>1</.test(prog), '进度反映已通关 1 关');

section('8. 键盘快捷键');
const space = keyHandlers[keyHandlers.length - 1];
let prevented = false;
space({ code:'Space', preventDefault: ()=>{ prevented = true; } });
check(prevented, '标题界面按空格被 preventDefault');
check(hidden('title-screen'), '按空格后离开标题界面');
check(!hidden('level-select'), '按空格后进入选关界面');

log(`\n========== UI 流程：${pass} 通过 / ${fail} 失败 ==========`);
process.exit(fail === 0 ? 0 : 1);
