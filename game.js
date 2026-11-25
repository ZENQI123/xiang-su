/* ============================================================
   像素战记 · 像素塔防卡牌
   单文件游戏引擎 (Canvas 2D + 像素风绘制)
   ------------------------------------------------------------
   五关：守卫基地 / 双路守卫 / 峡谷伏击 / 岩谷隘口 / 环岩圣所
   通用系统：地形（每关各自的地形表）/ 商店 / 升级被动 /
             双路与多出怪口 / 事件 / 图鉴
   ============================================================ */
'use strict';

/* ============================================================
   1. 网格配置
   ============================================================ */
const COLS = 22;
const ROWS = 14;               // 13 → 14：第五关下面加了一行，给底部出怪口留出行军空间
const TILE = 56;               // 每格像素
const PAD  = 4;                // 地图描边

/* 控制减免：精英 / BOSS 默认享有 30% 控制减免，
   眩晕 / 减速这类硬控时长都按这个比例打折（一发定住 BOSS 太破坏压迫感）。
   单个单位可用 ccResist 覆写（0 ~ 1）。 */
const CC_RESIST_TIER = 0.30;

const W = COLS * TILE;
const H = ROWS * TILE;

/* ============================================================
   2. 平衡数值（严格按策划案）
   ------------------------------------------------------------
   基准：剑士 = 1x
     hp 20 / dmg 1 / range 1格 / 攻速 1次/秒 / 移速 1格/秒
   ============================================================ */
const BASE = {
  swordsman: {
    id:'swordsman', name:'剑士', emoji:'🗡️',
    hp:22, dmg:1.1, range:1, atkRate:1, moveSpeed:1,
    kind:'melee', cost:1, holdLine:true
  },
  /* 远程兵（弓箭手 / 枪炮手）：血量 ×0.8、伤害 ×0.75 —— 削弱后排输出与生存 */
  archer: {
    id:'archer', name:'弓箭手', emoji:'🏹',
    hp:12, dmg:0.95, range:6, atkRate:0.8, moveSpeed:0.8,
    kind:'ranged', cost:1, holdLine:false
  },
  miner: {
    id:'miner', name:'矿工', emoji:'⛏️',
    hp:10, dmg:0, range:0, atkRate:0, moveSpeed:0,
    kind:'none', cost:1
  },
  /* ---- 第二关新卡：盾卫（自带脱战自愈 + 嘲讽特质） ---- */
  shield: {
    id:'shield', name:'盾卫', emoji:'🛡️',
    hp:32, dmg:0.5, range:1, atkRate:0.8, moveSpeed:0.7,
    kind:'melee', cost:1, holdLine:true,
    taunt:4,              // 嘲讽半径（格）：此范围内敌人优先攻击自己
  },
  /* ---- 第二关新卡：枪炮手（自带溅射） ---- */
  gunner: {
    id:'gunner', name:'枪炮手', emoji:'🔫',
    hp:14.4, dmg:1.875, range:5, atkRate:0.5, moveSpeed:0.6,
    kind:'ranged', cost:1, holdLine:false,
    splash:0.5,           // 溅射：相邻格敌人受到 50% 伤害
  },
  /* ---- 第 5 关商店精英：守卫者（石像守卫）----
     售价 75 / 召唤耗 2 行动值 / 场上最多 1 名 / 等级恒为 1（没有升级卡）
     光环：在场时全场友军攻击 +15%（含自身）
     免伤：自身受到的所有伤害 -20%
     阵亡：以自身为中心 2 格内敌人受 66 伤并炸出金色冲击波 */
  guardian: {
    id:'guardian', name:'守卫者', emoji:'🗿',
    hp:80, dmg:3, range:1, atkRate:1, moveSpeed:1,
    kind:'melee', cost:2, holdLine:true,
    noUpgrade:true,                    // 等级恒定 1 级
    allyAtkAura:0.15,                  // 友军攻击力 +15%
    dmgReduce:0.20,                    // 自身受伤 -20%
    deathBomb:{ radius:2, dmg:66 },    // 阵亡爆炸
  },
  monster: {
    id:'monster', name:'小怪', emoji:'👹',
    hp:30, dmg:1.5, range:1, atkRate:1, moveSpeed:1,
    kind:'melee', hostile:true
  },
  boss: {
    id:'boss', name:'BOSS', emoji:'😈',
    hp:75, dmg:3.75, range:2.5, atkRate:1, moveSpeed:1.3,
    kind:'melee', hostile:true,
    ccResist: CC_RESIST_TIER,   // 名字就叫 BOSS，同样吃 30% 控制减免
  },
  /* ---- 第二关新怪：飞行怪（无视地形，仅远程可打） ---- */
  flyer: {
    id:'flyer', name:'飞行怪', emoji:'🦇',
    hp:24, dmg:1.8, range:1, atkRate:1.1, moveSpeed:1.4,
    kind:'melee', hostile:true, flying:true, rangedOnly:true
  },
  /* ---- 第二关新怪：矿场破坏者（唯一会主动扑矿场的怪；只杀矿工，不拆矿场） ---- */
  sapper: {
    id:'sapper', name:'矿场破坏者', emoji:'🧨',
    hp:27, dmg:1.8, range:1, atkRate:0.9, moveSpeed:1.0,
    kind:'melee', hostile:true, antiMine:true
  },
  /* ---- 第二关新怪：攻城槌（只打基地，对基地伤害×2）----
     血量 120 → 60：原血量配上"只打基地 ×2 伤害"让玩家几乎来不及处理，
     削一半后它依然是最硬的常规怪，但可以被打掉了。 */
  ram: {
    id:'ram', name:'攻城槌', emoji:'🪨',
    hp:60, dmg:4.5, range:1.5, atkRate:0.6, moveSpeed:0.6,
    kind:'melee', hostile:true, baseOnly:true, baseDmgMul:2
  },
  /* ---- 第二关新怪：萨满（群体回血 + 受击给敌人加攻） ---- */
  shaman: {
    id:'shaman', name:'萨满', emoji:'🧙',
    hp:33, dmg:1.5, range:5, atkRate:0.7, moveSpeed:0.8,
    kind:'ranged', hostile:true, shaman:true
  },
  /* ---- 第二关新怪：狼骑（直扑基地，全场最快） ---- */
  wolf: {
    id:'wolf', name:'狼骑', emoji:'🐺',
    hp:21, dmg:2.25, range:1, atkRate:1.2, moveSpeed:2.2,
    kind:'melee', hostile:true, baseOnly:true
  },
  /* ---- 第二关 BOSS：攻城领主（统御光环 + 践踏）· 强化版 ---- */
  warlord: {
    id:'warlord', name:'攻城领主', emoji:'👹',
    hp:270, dmg:7.875, range:3.75, atkRate:1, moveSpeed:1.3,
    kind:'melee', hostile:true,
    tier:'elite',         // 精英单位（登场有专属介绍）
    aura:0.20,            // 统御：场上所有敌人 +20% 攻击
    stomp:true,           // 践踏：每 10 秒对半径 2 格玩家单位造成伤害
    stompDmg:8,           // 践踏伤害 8（技能伤害，不随本次 ×1.5 调整）
  },
  /* ---- 第三关新 BOSS：毁灭魔龙（飞行 · 定点轰炸） ----
     血量 320（原 400 ×0.8），飞行单位（仅远程可打）。
     技能「毁灭轰炸」：随机选取一个我方单位，
     在其半径 2 格标记预警圈，3 秒后爆炸，圈内我方单位受 20 伤，冷却 10 秒。
     【不伤及基地】：基地不会被选为目标，落在圈里也不会掉血。
     移动速度 = 剑士 × 0.75 = 0.75。 */
  overlord: {
    id:'overlord', name:'毁灭魔龙', emoji:'🐲',
    hp:320, dmg:4, range:2, atkRate:0.8, moveSpeed:0.75,
    kind:'melee', hostile:true, flying:true,
    tier:'boss',          // BOSS 单位（登场有专属介绍）
    bombRaid:true,        // 定点轰炸技能
    bombRadius:2, bombDmg:20, bombWarn:3, bombCd:10,
  },
  /* ---- 第四关新兵种：圣剑士（近战，攻击带眩晕） ----
     Lv2「圣光斩」：攻击变范围（相邻敌人 50% 伤害）+ 15% 概率眩晕 ×3
     Lv3「不屈」：生命归零后仍可战斗 4 秒 */
  holyblade: {
    id:'holyblade', name:'圣剑士', emoji:'⚔️',
    hp:25, dmg:1.2, range:2, atkRate:1.5, moveSpeed:0.8,
    kind:'melee', cost:1, holdLine:true,
    stun:0.3,             // 每次命中眩晕敌人 0.3 秒
  },

  /* ---- 第四关小怪：骷髅（远程减伤 30%；也是持盾骷髅转化出来的兵） ---- */
  skeleton: {
    id:'skeleton', name:'骷髅', emoji:'🦴',
    hp:25, dmg:1.9, range:1, atkRate:1, moveSpeed:1,
    kind:'melee', hostile:true,
    rangedResist:0.3,     // 远程伤害减免 30%
  },
  /* ---- 第五关 BOSS：骷髅王 ----
     出场方式：持盾骷髅（"容器"）倒下 → 破体而出的动画 → 在它倒下的位置现身 + BOSS 弹窗 + 15 秒专属 BGM
     数值：600 血 / 射程 3 / 20 伤 / 0.5 次每秒（2 秒一刀）/ 移速 0.4 格每秒
     技能：出场把场上 2 名我方士兵转化为骷髅（守卫者不可被选中）
           每 10 秒召唤 1 个骷髅；阵亡时再召唤 2 个 */
  skullking: {
    id:'skullking', name:'骷髅王', emoji:'👑',
    hp:600, dmg:20, range:3, atkRate:0.5, moveSpeed:0.4,
    kind:'melee', hostile:true,
    tier:'boss',
    spawnTransform:2,                        // 出场转化 2 名我方士兵
    spawnTransformExclude:['guardian'],      // 守卫者不可被选中
    minion:{ typeId:'skeleton', every:10 },  // 每 10 秒召唤 1 个骷髅
    deathSummon:{ typeId:'skeleton', count:2 },
  },
  /* ---- 第四关精英：持盾骷髅（远程减伤 50% · 击杀士兵→变成骷髅） ---- */
  skullguard: {
    id:'skullguard', name:'持盾骷髅', emoji:'💀',
    hp:260, dmg:7, range:2, atkRate:1.1, moveSpeed:1.2,
    kind:'melee', hostile:true,
    tier:'elite',         // 精英单位（登场有专属介绍 + 战场徽标）
    rangedResist:0.5,     // 持盾：远程伤害减半
    raiseFallen:true,     // 击杀士兵后把它转化为骷髅
  },

  /* 狂战士：已从第二关移除，数值保留备后续关卡（不进商店/事件） */
  berserker: {
    id:'berserker', name:'狂战士', emoji:'🪓',
    hp:28, dmg:1.4, range:1, atkRate:1.3, moveSpeed:1.1,
    kind:'melee', cost:2, holdLine:true
  },
};

/* ------------------------------------------------------------
   单位分级：精英 / BOSS
   ------------------------------------------------------------
   普通怪没有 tier；精英与 BOSS 出场时会播放专属登场介绍
   （全屏横幅 + 音效 + 世界短暂定格），并列出它有多难缠。
   ------------------------------------------------------------ */
const TIER_INFO = {
  elite: { label:'精英单位', en:'ELITE',  color:'#ffb648', glow:'rgba(255,182,72,.5)'  },
  boss:  { label:'BOSS 单位', en:'BOSS',  color:'#c06cff', glow:'rgba(192,108,255,.55)' },
};

const UNIT_INTRO = {
  skullguard: {
    tier:'elite', name:'持盾骷髅', en:'SHIELD SKELETON', emoji:'💀',
    tagline:'铁盾之壁 · 亡者不息',
    lines:[
      '持有大盾：受到的远程伤害减少 50%',
      '击杀我方士兵后，会把倒下的士兵转化为骷髅',
      '血量 260 · 攻击 7 · 射程 2 · 移速 1.2',
    ],
  },
  warlord: {
    tier:'elite', name:'攻城领主', en:'SIEGE WARLORD', emoji:'👹',
    tagline:'统御之威 · 步步紧逼',
    lines:[
      '统御光环：场上所有敌人攻击力 +20%',
      '践踏：每 10 秒震碎半径 2 格内的我方单位（8 伤）',
      '身板厚实（270 血），需集火速杀',
    ],
  },
  skullking: {
    tier:'boss', name:'骷髅王', en:'SKELETON KING', emoji:'👑',
    tagline:'破骨而出 · 亡者之王',
    lines:[
      '从持盾骷髅的躯壳里破体而出，现身即会夺走 2 名我方士兵（守卫者除外）',
      '血量 600 · 射程 3 格 · 每击 20 伤 · 每 2 秒挥砍一次 · 移速 0.4',
      '每 10 秒召唤 1 个骷髅；阵亡时再召唤 2 个',
    ],
  },
  overlord: {
    tier:'boss', name:'毁灭魔龙', en:'DRAGON OF RUIN', emoji:'🐲',
    tagline:'凋零之翼 · 天罚降临',
    lines:[
      '飞行单位：近战无法触及，只能靠远程火力击落（320 血）',
      '定点轰炸：随机锁定我方单位，半径 2 格红圈预警 3 秒后爆发 20 伤（冷却 10 秒）',
      '轰炸伤不到基地，但看到预警圈要立刻把兵撤出去！',
    ],
  },
};

/* 第二关开放召唤的卡牌（矿工/剑士/弓箭手） */
const CARD_ORDER = ['miner','swordsman','archer'];

const UPGRADE_COST = 10;       // （已弃用）旧的手牌升级消耗，保留常量兼容
const UPGRADE_MULT = 1.5;      // 升级倍率（血 / 伤 / 攻速 / 移速，按等级复利）
/* 攻击距离的升级倍率【单独计算】：线性叠加，每升一级只多 0.5 倍基础距离，
   而不是跟着 UPGRADE_MULT 复利膨胀（复利下 Lv3 = ×2.25，射程远到离谱）。
   Lv1 = ×1.0 / Lv2 = ×1.5 / Lv3 = ×2.0 */
const RANGE_UPGRADE_STEP = 0.5;
function rangeUpgradeMul(lv){ return 1 + RANGE_UPGRADE_STEP * (Math.max(1, lv||1) - 1); }

/* ============================================================
   第四关地形（按用户手绘地图翻译成 22×13 网格）
   ------------------------------------------------------------
   图例：黄 = 岩石（不可通行） / 红 = 山地＝高地（伤害 +25%） / 绿 = 林地（远程伤害 -40%）
   手绘稿 → 网格（先按底图边框做仿射对齐，再逐格取样；照片有约 2° 倾斜，已校正）：
     左区   c0~c5 基地侧开阔地，基地 (c1,r6)
     中岩   正中一块大岩体 c6~c11 × r4~r8
     右区   右上岩体 c13~c21 × r0~r4 + 右下岩体 c13~c21 × r7~r12，
            两者之间 r5~r6 是一条横贯走廊；中央岩体与右侧岩体之间只剩
            c12 一条竖向窄道 —— 两个出怪口就设在窄道口（见下）
     矿场   手绘图正下方那个写字的方框 → 2×2 矿场，锚点 (c7,r10)
            （位置写在 LEVEL_CONFIGS[4].mine，见 setMineTile）
     地形点 高地 (5,2) / 林地 (9,2) / 高地 (3,10) / 林地 (5,9) / 林地 (12,10)
   出怪点 走廊东端两个口：上口 (c21,r5) 走路上路、下口 (c21,r6) 走路下路
            （写在 LEVEL_CONFIGS[4].spawnUpper / spawnLower，见 setSpawnPoints）
   出怪波次：用户后续设置（laneWaves 暂空）
   ============================================================ */
const LEVEL4_TERRAIN = (()=>{
  const m = new Map();
  const put  = (c,r,id)=>m.set(c+','+r, id);
  const wall = (c,r)=>put(c,r,'rock');

  /* 中央大岩体 */
  for(let c=6;c<=11;c++){ for(let r=4;r<=8;r++) wall(c,r); }
  /* 右上 / 右下岩体：中间 r5~r6 留横贯走廊（出怪方向） */
  for(let c=13;c<COLS;c++){
    for(let r=0;r<=4;r++) wall(c,r);
    for(let r=7;r<ROWS;r++) wall(c,r);
  }

  /* 可通行地形：高地（红）/ 林地（绿） */
  put(5,2,'hill');  put(9,2,'forest');
  put(3,10,'hill'); put(5,9,'forest'); put(12,10,'forest');
  return m;
})();

/* ============================================================
   第五关地形（手绘「环岩」草图 → 22×13 网格）
   ------------------------------------------------------------
   草图要素：
     · 正中一栋 基地，外面一圈环形岩壁把它圈在中间（岩石，不可通行）
     · 环壁东、西、南三处各嵌一块「林地」，即三个缺口（林地可通行，
       里面的单位受到远程伤害 -40%）；环壁正上方是封死的
     · 西北一个「出怪地」、正南一个「出怪地」，两处敌人分头进环
     · 环外上方一条「行进路线」横贯，路线上压着「石矿场」
   网格落地：
     环心（=基地）(10,6)；环壁半径 3 格，用八边形（避免对角漏缝）：
        c7  r4~r8          |  c8  r3,4,8,9   |  c9  r3,9
        c10 r3,9           |  c11 r3,4,8,9   |  c12 r4~r8 … 按 dc/dr 对称展开
     缺口（林地）：西 (7,6) / 东 (13,6) / 南 (10,9)；北 (10,3) 是岩石，封死
     环内 5×5（c8~c12, r4~r8）正好等于「基地门口 2 格内」的召唤范围，
     所以玩家只能把兵摆进环里守三个缺口
   ============================================================ */
const LEVEL5_RING_CENTER = { c:10, r:6 };
const LEVEL5_TERRAIN = (()=>{
  const m = new Map();
  const put  = (c,r,id)=>m.set(c+','+r, id);
  const wall = (c,r)=>put(c,r,'rock');

  /* 环壁上每个格子的相对偏移（dc/dr）——手写出来，形状是可读的八边形，
     而不是 sqrt 半径算出来的"毛边圆"（毛边圆会有对角漏怪）。 */
  const RING = [
    /* 正西侧 / 正东侧：±3 列，行 -2..2 */
    [-3,-2],[-3,-1],[-3,0],[-3,1],[-3,2],
    [ 3,-2],[ 3,-1],[ 3,0],[ 3,1],[ 3,2],
    /* 中间两列：±2 列，行 ±2..±3 */
    [-2,-3],[-2,-2],[-2,2],[-2,3],
    [ 2,-3],[ 2,-2],[ 2,2],[ 2,3],
    /* 正上 / 正下：行 ±3，列 -1..1 */
    [-1,-3],[ 0,-3],[ 1,-3],
    [-1, 3],[ 0, 3],[ 1, 3],
  ];
  for(const [dc,dr] of RING) wall(LEVEL5_RING_CENTER.c+dc, LEVEL5_RING_CENTER.r+dr);

  /* 三处缺口改成林地（可通行，远程减伤 40%） */
  put(7, 6,'forest');    // 西
  put(13,6,'forest');    // 东
  put(10,9,'forest');    // 南
  return m;
})();

/* ============================================================
   第三关地形（除第一关教学关以外，每关都有自己的地形表）
   ------------------------------------------------------------
   第三关是单路开阔图，不放岩石（不挡路），只撒几块林地 / 高地 / 沼泽：
     · 林地 远程减伤 40% → 适合摆弓箭手 / 枪炮手
     · 高地 伤害 +25%    → 适合摆输出
     · 沼泽 移速 -50%    → 铺在敌人的必经之路上拖时间
   ============================================================ */
const LEVEL3_TERRAIN = (()=>{
  const m = new Map();
  const put = (c,r,id)=>m.set(c+','+r, id);
  put(6, 3,'hill');
  put(7, 9,'forest');
  put(11,4,'forest');
  put(12,10,'swamp');    // 敌人西行的必经之路
  put(16,7,'swamp');
  put(18,4,'hill');
  return m;
})();

/* ============================================================
   2c. 关卡配置表（选关用）
   ------------------------------------------------------------
   每关一份配置：回合数 / 行动值 / 基地血量 / 低保 / 是否商店 /
   是否地形 / 波次表。运行时写入 G.lv 供全局读取。
   ============================================================ */
const LEVEL_CONFIGS = {
  1: {
    id:1, name:'守卫基地', sub:'教学关 · 3 回合',
    desc:'单路防守，熟悉召唤与下令移动。撑过 3 个回合。商店只卖补给 / 升级（不出新兵种），敌人数量为常规的两倍。',
    rounds:3, apPerTurn:4, baseHp:20, floorGold:10,
    /* 第一关也开商店：shopCards:false → 货架不出现"解锁新兵种"，
       只出补给（急救包/军饷）与已有兵种的升级卡。 */
    /* 教学关不放地形：整张图开阔无障碍，先把召唤 / 移动 / 结算教会 */
    hasShop:true, hasTerrain:false, hasLanes:false,
    shopCards:false,
    startCards:['miner','swordsman','archer'],
    startGold:0,
    /* 出怪倍率 ×2：见 startRound 里按 lv.spawnMul 逐条复制波次列表 */
    spawnMul:2,
    waves:{
      1:{ reward:true, list:[] },
      2:{ list:['monster','monster'] },
      3:{ list:['monster','boss'] },
    },
  },
  2: {
    id:2, name:'双路守卫', sub:'正式关 · 7 回合',
    desc:'上路矿场 + 下路基地，中间被岩壁隔开。成片岩壁把战场切成两半，商店开放新兵种。',
    rounds:7, apPerTurn:5, baseHp:30, floorGold:10,
    hasShop:true, hasTerrain:true, hasLanes:true,
    /* terrainMap 在 TERRAIN_MAP 定义之后补挂（见下方 LEVEL_CONFIGS[2].terrainMap） */
    startCards:['miner','swordsman','archer'],
    startGold:0,
    waves:null,                 // 用 LEVEL2_ROUNDS（双路）
  },
  3: {
    id:3, name:'峡谷伏击', sub:'挑战关 · 5 回合',
    desc:'更高强度的单路防守。敌人更多、更杂，高级怪提前登场，沼泽与林地会明显改变交战节奏。',
    rounds:5, apPerTurn:5, baseHp:25, floorGold:10,
    hasShop:true, hasTerrain:true, hasLanes:false,
    terrainMap:LEVEL3_TERRAIN,     // 关卡专属地形
    startCards:['miner','swordsman','archer'],
    startGold:10,
    /* 加压版：总量 15→22 只（+47%），萨满/狼骑 R3 就来 */
    waves:{
      1:{ reward:true, list:[] },
      2:{ list:['monster','monster','monster','monster'] },
      3:{ list:['monster','monster','monster','wolf','wolf','shaman'] },
      4:{ list:['monster','monster','monster','shaman','flyer','flyer','wolf'] },
      5:{ list:['overlord','ram','warlord','flyer','flyer','monster','monster'] },
    },
  },
  4: {
    id:4, name:'岩谷隘口', sub:'自定关 · 6 回合',
    desc:'正中一大块岩体把战场分成上下两路，右侧上下也各是一块岩体；两片右岩之间 r5~r6 是一条横贯走廊，两个出怪口就设在走廊东端（上口走上路、下口走下路），敌人进来后经 c12 窄道分流。',
    rounds:6, apPerTurn:5, baseHp:30, floorGold:10,
    hasShop:true, hasTerrain:true, hasLanes:true,
    terrainMap:LEVEL4_TERRAIN,     // 关卡专属地形（见 LEVEL4_TERRAIN）
    mine:{ c:7, r:10 },            // 按手绘图下方那个方框放置的矿场（左上格锚点）
    lineCol:5, supportCol:3,       // 防线摆在中央岩体西侧（单条防线同时照看上下两路）
    /* 两个出怪口都在右侧走廊口（r5~r6 走廊的东端）：
       上口 (21,5) 走路上路，下口 (21,6) 走路下路。
       走廊只有 r5/r6 两行，散布收窄到 行 ±0（只左右散），否则会串到另一条路。 */
    spawnUpper:{ c:21, r:5 },
    spawnLower:{ c:21, r:6 },
    spawnSpread:{ c:3, r:0 },
    /* 上下两路等长（地图对称），所以给两条路各设一个"进路口"：
       出怪后先走到 c12 窄道本路那一侧，再恢复正常寻路 → 保证上口走上路、下口走下路 */
    laneGate:{ upper:{ c:12, r:4 }, lower:{ c:12, r:7 } },
    startCards:['miner','swordsman','archer'],
    startGold:0,
    /* 双路波次（upper / lower 两份列表） */
    laneWaves:{
      1:{ reward:true, upper:['skeleton'],               lower:['skeleton'] },
      2:{ upper:['skeleton','shaman'],                    lower:['skeleton','shaman'] },
      3:{ upper:['ram','skeleton','skeleton','boss'],     lower:['sapper','sapper'] },
      4:{ upper:['skeleton','skeleton','skeleton','shaman'],
          lower:['skeleton','skeleton','skeleton','shaman'] },
      5:{ upper:['wolf','wolf','wolf','boss'],            lower:['skeleton','skeleton','skeleton','skeleton'] },
      6:{ upper:['skullguard','skeleton','shaman','boss'], lower:['flyer','flyer','flyer','wolf'] },
    },
  },
  5: {
    id:5, name:'环岩圣所', sub:'自定义关 · 7 回合',
    desc:'基地被一圈环形岩壁圈在正中，环壁只在东、西、南三处嵌着林地缺口。三个出怪口各管一个门：左上口走西缺口、右上口走东缺口、正下口走南缺口，同时压三面。环内只有 5×5 的空间，站位与补位就是全部。',
    rounds:7, apPerTurn:5, baseHp:35, floorGold:10,
    hasShop:true, hasTerrain:true, hasLanes:false,
    hasRing:true,                  // 选关缩略图用「环形」画法
    /* 本关的持盾骷髅是"骷髅王的容器"：它倒下时会破体钻出骷髅王。
       kingVesselWave:7 → 只有第 7 波（最后一波）底下那只才是容器，
       第 5 波那只普通持盾骷髅不算，免得骷髅王提前登场。 */
    kingVessel:true,
    kingVesselWave:7,
    terrainMap:LEVEL5_TERRAIN,     // 关卡专属地形（见 LEVEL5_TERRAIN）
    baseTile:{ c:10, r:6 },        // 基地挪到环心（默认在 (1,6)，必须显式覆盖）
    mine:{ c:6, r:1 },             // 环外西北的「石矿场」（左上格锚点，2×2）
    /* 环内没有"一条竖线"可言，关掉防线 / 支援线的前压与两条辅助虚线，
       兵种完全靠玩家自己摆位 */
    guideLines:false, lineCol:null, supportCol:null,
    /* 三个出怪地：左上 / 右上 / 正下方。spawnPorts 的兵按顺序轮流从三个口出来，
       每个口带一个 gate（进路口）：先走到自己那个缺口门口，再恢复寻路 →
       左口必定走西缺口、右口必定走东缺口、下口必定走南缺口，不会串门 */
    spawnPorts:[
      { key:'left',  label:'左侧出怪口', c:1,  r:1,  gate:{ c:6,  r:6  } },   // 左上 → 西缺口 (7,6)
      { key:'right', label:'右侧出怪口', c:20, r:1,  gate:{ c:14, r:6  } },   // 右上 → 东缺口 (13,6)
      { key:'down',  label:'下方出怪口', c:10, r:13, gate:{ c:10, r:10 } },   // 正下 → 南缺口 (10,9)
    ],
    spawnSpread:{ c:1, r:1 },
    startCards:['miner','swordsman','archer'],
    startGold:0,
    /* 波次按「出怪口」逐口配置：left / right / down 三个口各管一份列表。
       第 7 回合只在下方口放一只持盾骷髅 —— 它就是骷髅王的容器
       （kingVessel：本关第一只持盾骷髅倒下时会破体钻出骷髅王）。 */
    portWaves:{
      1:{ reward:true,                       left:['skeleton'], right:['skeleton'] },
      2:{                                    right:['ram'],     down:['wolf'] },
      3:{ left:['skeleton','shaman'],        right:['skeleton','shaman'], down:['flyer'] },
      4:{ left:['skeleton','skeleton','skeleton','skeleton'],
          right:['skeleton','skeleton','skeleton','skeleton'],
          down:['skeleton','skeleton','skeleton','skeleton'] },
      5:{ left:['boss'],                     right:['boss'],    down:['skullguard'] },
      6:{ left:['shaman','shaman','ram','ram','boss','wolf','flyer'],
          right:['shaman','shaman','ram','ram','boss','wolf','flyer'] },
      7:{                                                       down:['skullguard'] },
    },
    /* 兼容旧逻辑：没有 portWaves 时仍走单路 waves（第五关已改用 portWaves，
       这里留一份同样走向的空表，避免 startRound 读到 undefined 报错） */
    waves:{},
  },
};

/* 前压防守（hold the line）—— 己方单位主动前出的"防线"列。
   敌人从右侧（col 15~21）涌来，近战兵前出到 LINE_COL 迎击，
   弓箭手则推进到后一排的支援线，靠射程覆盖前线。
   不再缩在基地门口傻等。 */
const DEFAULT_LINE_COL    = 9; // 近战防线所在列（默认；关卡可用 lv.lineCol 覆盖）
const DEFAULT_SUPPORT_COL = 6; // 远程支援线（在近战防线之后；关卡可用 lv.supportCol 覆盖）
let LINE_COL    = DEFAULT_LINE_COL;
let SUPPORT_COL = DEFAULT_SUPPORT_COL;
const LINE_TOLERANCE = 1;      // 距离防线多少格内即视为"已就位"
const ENGAGE_RANGE = 4;        // 视野：敌人进入此格数内主动迎击

/* ---- 以下为第一关兼容默认值（其余数值请以 G.lv 为准） ---- */
const MINE_GOLD    = 10;       // 每个矿工每回合产出金币
const FLOOR_GOLD   = 15;       // 每回合低保金币（第二关）
const AP_PER_TURN  = 5;        // 每回合行动值（第二关）
const BASE_HP_MAX  = 30;       // 基地生命（第二关）
const TOTAL_ROUNDS = 7;        // 第二关回合数

/* ---- 商店定价（统一） ---- */
const PRICE_NEW_CARD = 20;     // 新卡
const PRICE_LV2      = 30;     // 二级升级卡
const PRICE_LV3      = 50;     // 三级升级卡
const SHOP_SLOTS     = 3;      // 货架格数
const REFRESH_AP     = 1;      // 刷新消耗行动值
const REFRESH_GOLD   = 5;      // 刷新消耗金币
const REFRESH_MAX    = 2;      // 每回合刷新上限

/* ---- 召唤规则 ---- */
/* 回合开头的事件触发概率（第 2 回合起，一回合最多一个事件）：
   EV_RATE 是"本回合来事件"的总概率；正/负两个方向按次数动态配平（见 startRound）。
   实测约 84% 的回合会来事件，正负各占约一半。 */
const EV_RATE = 0.88;
const SUMMON_PER_TURN = 2;     // 每个兵种每回合可召唤的次数（消耗行动值 1/次）

/* ---- 兵种场上上限 ----
   同一兵种在场上的存活数量不能超过上限（死亡后腾出名额）。
   矿工上限与矿场格数对齐（4 格矿场 → 最多 4 名矿工）；
   同格叠加开采的机制仍在，只是总名额封顶 4。 */
const UNIT_CAPS = {
  miner: 4,       // = 矿场格数（4 格），一格一名
  swordsman: 4,
  archer: 4,
  shield: 2,      // 盾卫：嘲讽+自愈，压到 2
  gunner: 4,
  holyblade: 2,   // 圣剑士：带眩晕，压到 2
  guardian: 2,    // 守卫者：75 金的精英肉盾，全场最多 2 名
};
const UNIT_CAP_DEFAULT = 4;    // 未列出的兵种默认上限

function unitCap(typeId){
  return UNIT_CAPS[typeId] !== undefined ? UNIT_CAPS[typeId] : UNIT_CAP_DEFAULT;
}
/* 场上某兵种的存活数量 */
function unitCount(typeId){
  return G.units.filter(u => u.side==='player' && u.typeId===typeId && u.alive).length;
}

/* ============================================================
   2b. 地形系统
   ------------------------------------------------------------
   forest 树林：其中的单位受到远程伤害 -40%（受伤 ×0.6）
   hill   高地：站上去的单位伤害 +25%（输出 ×1.25）
   swamp  沼泽：进入的单位移速 -50%
   rock   岩石：完全不可通行（A* 需绕行）
   叠加规则：取最高不叠加
   ============================================================ */
const TERRAIN = {
  forest: { id:'forest', icon:'🌲', name:'树林', passable:true,  rangedReduce:0.4,
            tip:'受到远程伤害 -40%' },
  hill:   { id:'hill',   icon:'⛰',  name:'高地', passable:true,  dmgBonus:0.25,
            tip:'伤害 +25%' },
  swamp:  { id:'swamp',  icon:'🟫', name:'沼泽', passable:true,  speedMul:0.5,
            tip:'移速 -50%' },
  rock:   { id:'rock',   icon:'🪨', name:'岩石', passable:false,
            tip:'不可通行' },
};

/* 地形格表：key = "c,r" → 地形 id。
   ------------------------------------------------------------
   双路结构（第二关核心）：
     上路走廊（r4）：SPAWN_UPPER(c20,r2) → 矿场(c10~11, r2~3, 2×2) → 沿 r4 西行 → c9 南下 → 基地
     下路走廊（r11~r12）：SPAWN_LOWER(c21,r12) → 沿 r11/r12 西行 → 北上 → 基地
     中央隔离带 r7/r8/r9 为整排岩壁，上下两路只在西端（c≤9）汇合。
   —— 上路怪（含破坏者）沿 r4 走廊行进，不会顺路经过下路；
      下路怪也上不去，两路只在基地门口交汇，需要分兵把守。 */
const TERRAIN_MAP = (()=>{
  const m = new Map();
  const put  = (c,r,id)=>m.set(c+','+r, id);
  const wall = (c,r)=>put(c,r,'rock');

  /* ---------- 树林 / 高地 / 沼泽（可通行地形） ---------- */
  /* 树林：上路走廊掩体 + 下路掩体（树林内受到远程伤害 -40%） */
  put(6,1,'forest'); put(6,2,'forest'); put(3,11,'forest'); put(6,11,'forest');
  /* 高地：上路走廊抢点，站上去输出 +25% */
  put(13,4,'hill'); put(15,4,'hill');
  /* 高地：下路走廊抢点 */
  put(12,11,'hill');
  /* 沼泽：下路必经减速带（移速 -50%） */
  put(14,11,'swamp'); put(15,11,'swamp'); put(16,11,'swamp');
  /* 沼泽：上路走廊的一处减速段（原本在 11,2，现让位给矿场，西移到 9,2） */
  put(9,2,'swamp');

  /* ---------- 岩壁：隔开上下两路 ---------- */
  /* 石墙 A：上路走廊上方（r3），在 c10/c12/c14/c16/c18 留口形成锯齿 */
  [8,12,14,16,18].forEach(c=>wall(c,3));
  /* 石墙 B：上路走廊下方（r5） */
  [8,10,12,14,16,18].forEach(c=>wall(c,5));
  /* 石墙 C：基地行 r6 上方的隔断（c9 留口供上路南下到基地） */
  [10,12,13,14,15,16,17,18,19,20,21].forEach(c=>wall(c,6));
  /* 中央隔离带 r7 ~ r9（c9 为唯一南北通道） */
  for(let c=10;c<=21;c++){ wall(c,7); wall(c,8); }
  for(let c=10;c<=21;c++){ wall(c,9); }
  /* 下路走廊下沿：r10 的东段封死，下路怪只能沿 r11/r12 西行 */
  [16,17,18,19,20,21].forEach(c=>wall(c,10));

  /* ---------- 基地侧（c≤7）屏障：两翼封死，只留中央走廊 ---------- */
  /* 上路（r5~r7）西端屏障：迫使上路只能从 r4 走廊西行下来 */
  [5,6,7].forEach(r=>wall(7,r));
  /* 下路（r10~r12）西端屏障：迫使下路北上后再西进基地 */
  [10,11,12].forEach(r=>wall(7,r));
  return m;
})();
/* 第二关的地形表就是 TERRAIN_MAP，但它在关卡配置表之后才定义，
   所以在这里补挂上（配置表里只写了 hasTerrain:true） */
LEVEL_CONFIGS[2].terrainMap = TERRAIN_MAP;
/* 当前关卡使用的地形格表：每关自带自己的 terrainMap。
   没有地形的关卡返回一张空表 —— 绝不回退到别关的图，
   否则第一关会莫名继承第二关的岩壁（早期 bug）。 */
const EMPTY_TERRAIN_MAP = new Map();
function activeTerrainMap(){
  return (G && G.lv && G.lv.terrainMap) || EMPTY_TERRAIN_MAP;
}
/* 地形系统从第二关起生效；第一关是教学关（hasTerrain:false），
   图上不放任何地形格，也不参与绘制与寻路判定。
   注意：这里只管"开不开"，读哪张表由 activeTerrainMap 决定 —— 两者分开，
   避免早期那种"关了地形却仍在用别关的岩壁拦人"的 bug。 */
function terrainEnabled(){
  return !(G && G.lv && G.lv.hasTerrain === false);
}
/* 读取某格地形。关卡未启用地形时一律返回 null（含岩壁） */
function terrainAt(c,r){
  if(!terrainEnabled()) return null;
  /* 矿场 4 格是建筑物占位：地形一律让位（不减速 / 不加伤 / 不阻挡） */
  if(isMineTile(c,r)) return null;
  return TERRAIN[activeTerrainMap().get(c+','+r)] || null;
}

/* 地图坐标 (col,row) —— 双路结构
   上路：SPAWN_UPPER(c20,r2) → 矿场(c10~11, r2~3) → r4 走廊 → 基地
   下路：SPAWN_LOWER(c21,r12) → 底部西行 → 北上 → 基地 */
const BASE_TILE   = { c:1,  r:6  };
/* 基地位置（可被关卡配置覆盖）：默认在左中 (1,6)；
   第五关基地在环心 (10,6)，写 LEVEL_CONFIGS[5].baseTile，开局由 setBaseTile 生效。
   同样"原地改对象"，外部引用始终有效。 */
function setBaseTile(t){
  const a = t || { c:1, r:6 };
  BASE_TILE.c = a.c; BASE_TILE.r = a.r;
}
/* 矿场：2×2 共 4 格。MINE_TILE 是左上角的锚点（渲染 / 破坏者驻守 / 覆盖判定都基于它），
   MINE_TILES 是四格列表。产金按【每格独立】计算：每个矿工按自己所站的那一格计 10 金。
   位置可被关卡配置覆盖（LEVEL_CONFIGS[n].mine），开局时由 setMineTile 重新计算。 */
const DEFAULT_MINE_TILE = { c:10, r:2  };    // 默认锚点（第二关）
const MINE_TILE   = { ...DEFAULT_MINE_TILE };  // 当前关卡的矿场锚点（左上格）
const MINE_TILES  = [];
function setMineTile(anchor){
  const a = anchor || DEFAULT_MINE_TILE;
  /* 原地改，不换对象：外部（测试 / 其他模块）拿到的引用始终有效 */
  MINE_TILE.c = a.c; MINE_TILE.r = a.r;
  MINE_TILES.length = 0;
  MINE_TILES.push(
    { c:a.c,   r:a.r   }, { c:a.c+1, r:a.r   },
    { c:a.c,   r:a.r+1 }, { c:a.c+1, r:a.r+1 },
  );
}
setMineTile(DEFAULT_MINE_TILE);
/* 某格是否属于矿场（4 格内任一格）。
   矿场是"建筑物"，会覆盖底下的地形：无论地形表里写了什么，
   这 4 格一律可通行、且不带任何地形效果（不减速、不加伤、不挡路）。 */
function isMineTile(c,r){
  return c>=MINE_TILE.c && c<=MINE_TILE.c+1 && r>=MINE_TILE.r && r<=MINE_TILE.r+1;
}
/* 矿场格上不允许出现的地形 id 白名单（用于自查 / 测试） */
function mineTileTerrainConflicts(){
  const bad = [];
  for(const t of MINE_TILES){
    const id = activeTerrainMap().get(t.c+','+t.r);
    if(id && (id==='rock' || TERRAIN[id] && TERRAIN[id].passable===false)) bad.push({...t, id});
  }
  return bad;
}
/* 矿场格心（整块 2×2 的中心，用于渲染 / 飘字 / 破坏者驻守目标） */
function mineCenterTile(){
  return { c: MINE_TILE.c + 0.5, r: MINE_TILE.r + 0.5 };
}
/* 整块矿场的像素中心 */
function mineCenterPx(){
  return tileCenter(MINE_TILE.c + 1, MINE_TILE.r + 1);
}
/* 刷怪点（每关可配）：
   默认值 = 第二关的 (20,2) / (21,12)；关卡配置里写 spawnUpper / spawnLower 即可覆盖。
   与矿场一样"原地改对象"，外部（测试 / 渲染）拿到的引用始终有效。 */
const DEFAULT_SPAWN_UPPER = { c:20, r:2  };
const DEFAULT_SPAWN_LOWER = { c:21, r:12 };
const SPAWN_UPPER = { c:20, r:2  };   // 当前关卡上路固定刷怪点
const SPAWN_LOWER = { c:21, r:12 };   // 当前关卡下路固定刷怪点
function setSpawnPoints(up, lo){
  const u = up || DEFAULT_SPAWN_UPPER, l = lo || DEFAULT_SPAWN_LOWER;
  SPAWN_UPPER.c = u.c; SPAWN_UPPER.r = u.r;
  SPAWN_LOWER.c = l.c; SPAWN_LOWER.r = l.r;
}
/* 刷怪散布半径：默认 列 ±1 / 行 ±2。
   窄道关（第四关）收窄到 行 ±1，否则一个小队会越过走廊口跑到另一条路上去。 */
const DEFAULT_SPAWN_SPREAD = { c:1, r:2 };
const SPAWN_SPREAD = { c:1, r:2 };
function setSpawnSpread(s){
  const d = s || DEFAULT_SPAWN_SPREAD;
  SPAWN_SPREAD.c = d.c; SPAWN_SPREAD.r = d.r;
}
setSpawnPoints(); setSpawnSpread();

/* 多出怪口（第五关）：关卡配置写 spawnPorts:[{c,r},...] 时，
   本关的敌人按顺序轮流从各个口出来（不再是"只有一个下路口"）。
   不写 spawnPorts 的关卡行为完全不变。 */
let spawnPortIdx = 0;
let lastSpawnPort = null;      // 最近一次用到的出怪口（用于取它的 gate）
function spawnPortsOf(){
  const p = G && G.lv && G.lv.spawnPorts;
  return (p && p.length) ? p : null;
}
/* key 为空 → 按顺序轮流；给了 key（left / right / down）→ 固定取那一个口，
   这样波次表里「左边刷什么、右边刷什么」才能精确对应到各自的出怪口。 */
function nextSpawnPort(key){
  const ps = spawnPortsOf();
  if(!ps){ lastSpawnPort = null; return null; }
  let p = null;
  if(key){
    for(const q of ps){ if(q.key === key){ p = q; break; } }
  }
  if(!p){ p = ps[spawnPortIdx % ps.length]; spawnPortIdx++; }
  lastSpawnPort = p;
  return p;
}

/* ============================================================
   3. 工具
   ============================================================ */
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp  = (a,b,t)=>a+(b-a)*t;
const dist  = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const rnd   = (a,b)=>a+Math.random()*(b-a);
const rndInt= (a,b)=>Math.floor(rnd(a,b+1));

/* 格心 → 像素坐标 */
function tileCenter(c,r){ return { x: c*TILE+TILE/2, y: r*TILE+TILE/2 }; }
/* 像素 → 格 */
function pxToTile(x,y){ return { c: clamp(Math.floor(x/TILE),0,COLS-1), r: clamp(Math.floor(y/TILE),0,ROWS-1) }; }
/* 格距 */
function tileDist(a,b){ return Math.hypot(a.c-b.c, a.r-b.r); }
/* 格 → 像素距离 */
function pxDistTiles(n){ return n*TILE; }
/* 像素距离 → 格数 */
function tilesOf(px){ return px/TILE; }

/* ============================================================
   3b. 音效系统（Web Audio 实时合成，不引入任何外部音频文件）
   ------------------------------------------------------------
   · 全部音色由振荡器 / 噪声 + 包络现场合成，零资源加载
   · 浏览器要求 AudioContext 必须在用户交互后才能出声，
     所以首次点击 / 按键时调用 SFX.unlock()
   · 静音开关持久化在 localStorage；无 Web Audio 环境
     （headless 测试）自动全程静默，绝不抛错
   ============================================================ */
const MUTE_KEY = 'pixelTD.muted.v1';

const SFX = (function(){
  let ac = null, master = null;
  let muted = false;
  try{
    if(typeof localStorage !== 'undefined') muted = localStorage.getItem(MUTE_KEY) === '1';
  }catch(e){ /* 隐私模式 → 默认不静音 */ }

  function ctx(){
    if(ac) return ac;
    try{
      const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if(!AC) return null;                    // 无 Web Audio（测试桩）→ 静默
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ac.destination);
    }catch(e){ ac = null; }
    return ac;
  }
  /* 首次用户交互时解锁（浏览器自动播放策略） */
  function unlock(){
    const c = ctx();
    if(c && c.state === 'suspended'){ try{ c.resume(); }catch(e){} }
    return c;
  }
  /* 振荡器音符：f → to 滑音，包络 起音 → 指数衰减 */
  function tone(f, dur, opt){
    const c = ctx(); if(!c || muted) return;
    opt = opt || {};
    const t0 = c.currentTime + (opt.delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opt.type || 'square';
    osc.frequency.setValueAtTime(Math.max(20, f), t0);
    if(opt.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t0 + dur);
    const vol = (opt.vol == null ? 0.1 : opt.vol);
    const atk = Math.min(0.02, dur * 0.25);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(opt.dest || master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  /* 噪声（命中 / 爆炸 / 冲击） */
  function noise(dur, opt){
    const c = ctx(); if(!c || muted) return;
    opt = opt || {};
    const t0 = c.currentTime + (opt.delay || 0);
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for(let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = (opt.vol == null ? 0.14 : opt.vol);
    if(opt.lp){
      const flt = c.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = opt.lp;
      src.connect(flt); flt.connect(g);
    } else src.connect(g);
    g.connect(opt.dest || master);
    src.start(t0);
  }
  /* 同类音效节流：几十个单位同时开打时不至于糊成一团 */
  const lastAt = {};
  function throttle(key, ms){
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if(lastAt[key] && now - lastAt[key] < ms) return false;
    lastAt[key] = now;
    return true;
  }

  /* ---- 音色表 ---- */
  const P = {
    click:   ()=>{ tone(620, 0.05, { type:'square',   vol:0.05 }); },
    select:  ()=>{ tone(880, 0.06, { type:'triangle', vol:0.06 }); },
    deny:    ()=>{ tone(170, 0.14, { type:'sawtooth', vol:0.06, to:90 }); },
    summon:  ()=>{ tone(392, 0.12, { type:'triangle', vol:0.10, to:523 });
                   tone(784, 0.16, { type:'triangle', vol:0.06, delay:0.09 }); },
    place:   ()=>{ tone(196, 0.10, { type:'square',   vol:0.11, to:130 }); },
    move:    ()=>{ tone(520, 0.05, { type:'triangle', vol:0.05 }); },
    coin:    ()=>{ if(!throttle('coin', 60)) return;
                   tone(1175, 0.06, { type:'square', vol:0.06 });
                   tone(1568, 0.08, { type:'square', vol:0.05, delay:0.05 }); },
    buy:     ()=>{ tone(523, 0.08, { type:'square', vol:0.09 });
                   tone(784, 0.12, { type:'square', vol:0.07, delay:0.07 }); },
    upgrade: ()=>{ [523,659,784].forEach((f,i)=>tone(f, 0.16, { type:'triangle', vol:0.10, delay:i*0.07 })); },
    hit:     ()=>{ if(!throttle('hit', 70)) return;   noise(0.05, { vol:0.05, lp:2200 }); },
    death:   ()=>{ if(!throttle('death', 90)) return; tone(200, 0.20, { type:'sawtooth', vol:0.08, to:70 }); },
    baseHit: ()=>{ if(!throttle('baseHit', 120)) return;
                   tone(90, 0.28, { type:'sawtooth', vol:0.17, to:42 });
                   noise(0.14, { vol:0.09, lp:700 }); },
    warn:    ()=>{ tone(1046, 0.07, { type:'square', vol:0.07 });
                   tone(1046, 0.07, { type:'square', vol:0.07, delay:0.16 }); },
    explode: ()=>{ noise(0.50, { vol:0.24, lp:1000 });
                   tone(130, 0.45, { type:'sawtooth', vol:0.16, to:38 }); },
    stomp:   ()=>{ tone(64, 0.34, { type:'sawtooth', vol:0.20, to:30 });
                   noise(0.20, { vol:0.11, lp:420 }); },
    event:   ()=>{ tone(740, 0.10, { type:'triangle', vol:0.08 });
                   tone(988, 0.14, { type:'triangle', vol:0.07, delay:0.09 }); },
    turn:    ()=>{ [392,523].forEach((f,i)=>tone(f, 0.20, { type:'square', vol:0.07, delay:i*0.1 })); },
    elite:   ()=>{ [196,262,330].forEach((f,i)=>tone(f, 0.55, { type:'sawtooth', vol:0.11, delay:i*0.11 }));
                   noise(0.70, { vol:0.07, lp:320 }); },
    boss:    ()=>{ tone(98, 1.30, { type:'sawtooth', vol:0.16, to:49 });
                   tone(196, 1.00, { type:'square', vol:0.07, to:98, delay:0.06 });
                   noise(0.95, { vol:0.10, lp:560 }); },
    win:     ()=>{ [523,659,784,1046].forEach((f,i)=>tone(f, 0.34, { type:'triangle', vol:0.12, delay:i*0.12 })); },
    lose:    ()=>{ [392,330,262,196].forEach((f,i)=>tone(f, 0.40, { type:'sawtooth', vol:0.11, delay:i*0.15 })); },
  };

  /* ============================================================
     BOSS 专属 BGM：d 小调，低沉鼓点 + 骨笛式的稀疏旋律
     ------------------------------------------------------------
     · 全部音符在调用时一次性排进 AudioContext 时间轴，15 秒后自动收尾
     · 走独立的 bgmBus（有自己的 gain），stopBgm() 一句话就能掐断
       （关卡结算 / 重开 / 静音时不至于继续在后台响）
     ============================================================ */
  let bgmBus = null, bgmTimer = null;
  function stopBgm(){
    if(bgmTimer){ clearTimeout(bgmTimer); bgmTimer = null; }
    if(bgmBus){
      const b = bgmBus; bgmBus = null;
      try{ b.gain.cancelScheduledValues(0); b.gain.setValueAtTime(0.0001, ac ? ac.currentTime : 0); }catch(e){}
      setTimeout(()=>{ try{ b.disconnect(); }catch(e){} }, 60);
    }
  }
  function bossBgm(seconds){
    const c = ctx();
    const dur = Math.max(1, seconds || 15);
    if(!c || muted) return false;
    stopBgm();
    const bus = c.createGain();
    bus.gain.value = 0.75;
    bus.connect(master);
    bgmBus = bus;
    const dest = bus;

    /* 一小节 4 拍，每拍 0.75 秒 = 3 秒；15 秒 = 5 小节 */
    const BEAT = 0.75, BAR = BEAT * 4;
    const bass  = [73.42, 73.42, 87.31, 65.41];   // D2 D2 F2 C2
    const lead  = [293.7, 0, 349.2, 293.7, 0, 261.6, 233.1, 0]; // D4 F4 D4 C4 Bb3（0=空拍）
    for(let bar=0; bar*BAR < dur; bar++){
      const t0 = bar * BAR;
      /* 低音鼓 + 低音线 */
      noise(0.22, { vol:0.10, lp:220, delay:t0, dest });
      noise(0.18, { vol:0.08, lp:200, delay:t0 + BEAT*2, dest });
      bass.forEach((f,i)=>{
        if(t0 + i*BEAT >= dur) return;
        tone(f, BEAT*0.9, { type:'sawtooth', vol:0.075, delay:t0 + i*BEAT, dest });
      });
      /* 骨笛旋律（三角波，只在前两小节与最后一小节出现，留出呼吸） */
      if(bar % 2 === 0 || bar*BAR + BAR > dur - 1){
        lead.forEach((f,i)=>{
          if(!f || t0 + i*BEAT/2 >= dur) return;
          tone(f, 0.42, { type:'triangle', vol:0.055, delay:t0 + i*BEAT/2, dest });
        });
      }
      /* 每小节末尾一声骨响 */
      tone(1174.7, 0.10, { type:'square', vol:0.028, delay:t0 + BAR - 0.12, dest });
    }
    /* 收尾：一个大三度下行，明确"这一段结束了" */
    tone(146.8, 1.2, { type:'sawtooth', vol:0.09, to:73.4, delay:Math.max(0, dur-1.2), dest });
    tone(220.0, 1.0, { type:'triangle', vol:0.05, to:110,  delay:Math.max(0, dur-1.1), dest });

    bgmTimer = setTimeout(stopBgm, (dur + 0.4) * 1000);
    return true;
  }

  function play(name){
    if(muted) return;
    const fn = P[name];
    if(!fn) return;
    try{ fn(); }catch(e){ /* 音频异常绝不影响游戏 */ }
  }
  function setMuted(on){
    muted = !!on;
    try{ if(typeof localStorage !== 'undefined') localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); }catch(e){}
    if(master) master.gain.value = muted ? 0 : 1;
    return muted;
  }
  return {
    play, unlock, setMuted, stopBgm, bossBgm,
    toggle:  ()=> setMuted(!muted),
    isMuted: ()=> muted,
    get ctx(){ return ac; },
  };
})();

/* 全局便捷入口 */
function sfx(name){ SFX.play(name); }
/* 骷髅王 15 秒专属 BGM（静音 / 无 Web Audio 环境时安全空转） */
function playBossBgm(sec){ try{ return SFX.bossBgm(sec); }catch(e){ return false; } }
function stopBossBgm(){ try{ SFX.stopBgm(); }catch(e){} }

/* ============================================================
   4. 游戏状态
   ============================================================ */
let G = null;
let CURRENT_LEVEL = 1;      // 当前选择关卡（1 | 2）
let briefingActive = false;  // 简报过场是否处于"等待点击入场"状态
let loadingSave = false;      // 正在读档：newGame 不要自行推进第 1 回合事件（否则会重弹「选援军」）

/* ---- 通关记录 { levelId: true }：通关上一关即解锁下一关 ----
   存在 localStorage 里，刷新页面后解锁进度不丢。 */
const CLEAR_SAVE_KEY = 'pixelTD.cleared.v1';
/* 从 localStorage 读一份通关记录（纯读，不改全局） */
function readCleared(){
  const out = {};
  try{
    const raw = (typeof localStorage!=='undefined') && localStorage.getItem(CLEAR_SAVE_KEY);
    if(raw){
      const obj = JSON.parse(raw);
      for(const k in obj) if(obj[k]) out[+k] = true;
    }
  }catch(e){ /* 无 localStorage（测试桩/隐私模式）→ 返回空记录 */ }
  return out;
}
const CLEARED = readCleared();

/* ============================================================
   图鉴：兵种 / 怪兽 / 事件
   ------------------------------------------------------------
   · 兵种：玩家拥有过（开局手牌 / 商店购买 / 出征选中）即解锁
   · 怪兽：在场上出现过（刷出 / 骷髅转化）即记录
   · 事件：全部直接展示（不需要解锁）
   记录持久化在 localStorage。
   ============================================================ */
const CODEX_KEY = 'pixelTD.codex.v1';
const CODEX_UNITS    = ['swordsman','archer','miner','shield','gunner','holyblade','guardian'];
const CODEX_MONSTERS = ['monster','boss','flyer','sapper','ram','shaman','wolf','warlord','overlord','skeleton','skullguard','skullking'];
function readCodex(){
  const out = { units:{}, monsters:{} };
  try{
    const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(CODEX_KEY);
    if(raw){
      const o = JSON.parse(raw);
      if(o && typeof o === 'object'){
        if(o.units)    out.units    = o.units;
        if(o.monsters) out.monsters = o.monsters;
      }
    }
  }catch(e){ /* 忽略损坏数据 */ }
  return out;
}
const CODEX = readCodex();
function saveCodex(){
  try{ if(typeof localStorage !== 'undefined') localStorage.setItem(CODEX_KEY, JSON.stringify(CODEX)); }catch(e){}
}
/* 记录一次"见过"：玩家的兵种 / 敌方的怪兽 */
function codexMark(side, typeId){
  if(!typeId) return;
  if(CODEX_MONSTERS.includes(typeId) && side === 'enemy'){
    if(!CODEX.monsters[typeId]){ CODEX.monsters[typeId] = true; saveCodex(); }
    return;
  }
  if(CODEX_UNITS.includes(typeId) && side !== 'enemy'){
    if(!CODEX.units[typeId]){ CODEX.units[typeId] = true; saveCodex(); }
  }
}
/* 已解锁数量（用于标题进度 / 图鉴标题） */
function codexProgress(){
  return {
    units: CODEX_UNITS.filter(id=>CODEX.units[id]).length,
    unitsTotal: CODEX_UNITS.length,
    monsters: CODEX_MONSTERS.filter(id=>CODEX.monsters[id]).length,
    monstersTotal: CODEX_MONSTERS.length,
  };
}
function saveCleared(){
  try{
    if(typeof localStorage!=='undefined') localStorage.setItem(CLEAR_SAVE_KEY, JSON.stringify(CLEARED));
  }catch(e){ /* 忽略写入失败 */ }
}

/* ============================================================
   战斗进度存档：行动阶段自动保存，标题界面可"继续上局"
   ============================================================ */
const BATTLE_SAVE_KEY = 'pixelTD.battle.v1';

function hasBattleSave(){
  try{
    return !!(typeof localStorage!=='undefined' && localStorage.getItem(BATTLE_SAVE_KEY));
  }catch(e){ return false; }
}
function clearBattleSave(){
  try{
    if(typeof localStorage!=='undefined') localStorage.removeItem(BATTLE_SAVE_KEY);
  }catch(e){}
}

/* 保存当前战斗（只在行动阶段保存：状态稳定、无事件链在途） */
function saveGame(){
  if(!G || G.phase!=='playing' || G.turnPhase!=='action' || !G.lv) return;
  try{
    if(typeof localStorage==='undefined') return;
    /* 单位做净化拷贝：剔除 target（循环引用，载入后自动重新索敌）与函数 */
    const units = G.units.map(u=>{
      const c = {};
      for(const k in u){
        if(k==='target') continue;
        const v = u[k];
        if(typeof v==='function') continue;
        if(v && typeof v==='object' && v.isBase) continue;
        c[k]=v;
      }
      return c;
    });
    const data = {
      version:1,
      lvId:G.lv.id, round:G.round,
      baseHp:G.baseHp, baseHpMax:G.baseHpMax,
      gold:G.gold, ap:G.ap, apMax:G.apMax, nextUid:G.nextUid,
      cards:G.cards, units,
      shop:G.shop,
      pendingSpawns:G.pendingSpawns, roundEvents:G.roundEvents,
      spawnPreview:G.spawnPreview,
      bombWarnings:G.bombWarnings,
      thunder:G.thunder, thunderWarnings:G.thunderWarnings,
      enemySpeedMul:G.enemySpeedMul,
      allyDmgMul:G.allyDmgMul,
      savedAt:Date.now(),
    };
    localStorage.setItem(BATTLE_SAVE_KEY, JSON.stringify(data));
  }catch(e){ /* 存档失败静默（隐私模式 / 容量不足） */ }
}

/* 载入存档并恢复战斗。返回 true=成功 */
function loadGame(){
  let data = null;
  try{
    data = JSON.parse((typeof localStorage!=='undefined' && localStorage.getItem(BATTLE_SAVE_KEY)) || 'null');
  }catch(e){}
  if(!data || data.version!==1 || !LEVEL_CONFIGS[data.lvId]) return false;

  /* 重置运行时杂项后按存档关重建状态（菜单态调用 → newGame 不会派发事件链） */
  PROJ.length = 0;
  selectedUnit = null;
  hoverTile = null;
  pendingReward = null;
  briefingActive = false;
  loadingSave = true;          // 防止 newGame 重放开局事件（会二次弹出「选援军」）
  try{ newGame(data.lvId); } finally { loadingSave = false; }
  /* 清掉可能残留在 DOM 里的弹窗（老存档 / 上一局遗留） */
  closeRewardModal(); closeNegModal(); closePosModal();
  pendingReward = null;

  try{
    G.round      = data.round;
    G.baseHp     = data.baseHp;
    G.baseHpMax  = data.baseHpMax;
    G.gold       = data.gold;
    G.ap         = data.ap;
    G.apMax      = data.apMax;
    G.nextUid    = data.nextUid;
    G.cards      = data.cards || G.cards;
    G.shop       = data.shop || { slots:[], refreshLeft:REFRESH_MAX };
    G.units      = (data.units || []).map(u => { u.target = null; return u; });
    G.pendingSpawns  = data.pendingSpawns  || [];
    /* 出怪预告：存档里有就用存档的，老存档没有则按待出清单重建 */
    if(data.spawnPreview) G.spawnPreview = data.spawnPreview;
    else buildSpawnPreview(G.round);
    G.roundEvents    = data.roundEvents    || [];
    G.bombWarnings   = data.bombWarnings   || [];
    G.thunder        = data.thunder        || null;
    G.thunderWarnings= data.thunderWarnings|| [];
    G.enemySpeedMul  = data.enemySpeedMul  || 1;
    G.allyDmgMul     = data.allyDmgMul     || 1;
    G.choiceOpen     = false;              // 载入后无事件模态
    G.triggerQueue   = [];                 // 行动阶段存档：事件链已走完
    G.spawnAfterAction = false;
    G.pendingSummon    = null;
    G.selectedUnit     = null;
    G.turnPhase        = 'action';
    G.phase            = 'playing';
    /* 基地血量同步 */
    G.base.hp    = data.baseHp;
    G.base.hpMax = data.baseHpMax;
  }catch(e){
    clearBattleSave();
    return false;
  }
  buildGround();
  CURRENT_LEVEL = data.lvId;
  logLine(`已恢复进度：第 ${data.lvId} 关 · 第 ${data.round} 回合`, 'pos');
  updateUI();
  return true;
}

/* 标题界面"继续上局" */
function continueBattle(){
  if(!hasBattleSave()){ toast('没有可用的存档'); return; }
  $('title-screen').classList.add('hidden');
  $('level-select').classList.add('hidden');
  $('overlay').classList.add('hidden');
  $('help-overlay').classList.add('hidden');
  $('briefing').classList.add('hidden');
  briefingActive = false;
  if(loadGame()){
    showBanner(`进度已恢复 · 第 ${G.round} 回合`, 'pos');
  } else {
    clearBattleSave();
    toast('存档已损坏，已清除');
    backToTitle();
  }
}

/* 关卡有序列表（按 id 升序） */
function levelIds(){
  return Object.keys(LEVEL_CONFIGS).map(Number).sort((a,b)=>a-b);
}
/* 是否已解锁：第 1 关永远开放；其余关需上一关已通关 */
function isLevelUnlocked(id){
  /* 关卡配置写 alwaysUnlocked:true → 不看通关记录直接放行（试玩期用） */
  if(LEVEL_CONFIGS[id] && LEVEL_CONFIGS[id].alwaysUnlocked) return true;
  const ids = levelIds();
  const i = ids.indexOf(id);
  if(i <= 0) return true;              // 第一关 / 未知关（兜底放行）
  return !!CLEARED[ids[i-1]];
}
/* 已解锁的最大关卡号（用于"继续游戏"） */
function maxUnlockedLevel(){
  /* alwaysUnlocked 的关卡不参与"进度"计算：它只是能直接进去玩，不代表前面的都通了 */
  const ids = levelIds().filter(id => !(LEVEL_CONFIGS[id] && LEVEL_CONFIGS[id].alwaysUnlocked));
  const list = ids.length ? ids : levelIds();
  let best = list[0];
  for(const id of list) if(isLevelUnlocked(id)) best = id;
  return best;
}
/* 下一关 id（没有则返回 null） */
function nextLevelId(id){
  const ids = levelIds();
  const i = ids.indexOf(id);
  return (i>=0 && i<ids.length-1) ? ids[i+1] : null;
}

/* 关卡配置读取：G.lv 已在 newGame 中写入，供全局使用 */
function lv(){ return G.lv; }

function newGame(levelId){
  const cfg = LEVEL_CONFIGS[levelId || CURRENT_LEVEL || 1];
  CURRENT_LEVEL = cfg.id;
  stopBossBgm();               // 上一局的 BOSS BGM 不许跨局继续响

  /* 本关可覆盖的全局坐标：基地 / 矿场 / 刷怪点 / 刷怪散布 / 近战防线列 / 远程支援线 */
  setBaseTile(cfg.baseTile);
  setMineTile(cfg.mine || DEFAULT_MINE_TILE);
  setSpawnPoints(cfg.spawnUpper, cfg.spawnLower);
  setSpawnSpread(cfg.spawnSpread);
  spawnPortIdx = 0;                                  // 多出怪口：每局从第 1 个口重新轮流
  lastSpawnPort = null;
  /* guideLines:false 的关（第五关环内）不设防线：LINE_COL = null →
     近战兵不再自动"前出到防线"，两条辅助虚线也不画 */
  const noGuide = cfg.guideLines === false;
  LINE_COL    = noGuide ? null : (cfg.lineCol    != null ? cfg.lineCol    : DEFAULT_LINE_COL);
  SUPPORT_COL = noGuide ? null : (cfg.supportCol != null ? cfg.supportCol : DEFAULT_SUPPORT_COL);

  G = {
    lv: cfg,                    // 当前关卡配置
    phase:'playing',            // playing | over
    result:null,                // win | lose
    round:1,                    // 当前回合
    turnPhase:'event',          // event(回合开始事件) | action(行动) | enemy(敌方行动)
    baseHp:cfg.baseHp,
    baseHpMax:cfg.baseHp,
    gold:cfg.startGold||0,
    ap:cfg.apPerTurn,
    apMax:cfg.apPerTurn,

    units:[],                   // 场上全部单位
    nextUid:1,

    cards:{},                   // cardId -> {lv, summonUsedThisTurn}
    selectedUnit:null,          // 已选中的己方士兵 uid
    flashTiles:[],              // 提示高亮 {c,r,life,color}
    floats:[],                  // 飘字 {x,y,text,color,life,vy}
    pendingSummon:null,         // {cardId} 等待选择召唤位置

    log:[],                     // {text, cls}
    banner:null,                // {text, cls, life}
    bannerTimer:0,
    triggerQueue:[],            // 待触发的事件
    roundEvents:[],
    evLast:[],                  // 最近两次事件的类型（用于连击约束）
    evCount:{ pos:0, neg:0 },   // 正/负事件累计次数（用于配平）
    pendingSpawns:[],           // 本回合待出怪的 spawn 事件（endTurn 结算后执行）
    spawnAfterAction:false,     // 事件队列走完后：true=接敌方阶段（出怪队列），false=进入行动阶段
    /* 出怪预告：本回合每个出怪口「还没出」的敌人，供出怪口 HUD 显示
       { round, upper:{queue:[typeId…], has:bool, done:bool}, lower:{…} } */
    spawnPreview:makeSpawnPreview(0),
    bombWarnings:[],            // 毁灭魔龙的轰炸预警 {c,r,timer,total,dmg,radius,ownerUid}
    thunder:null,               // 天打雷劈：{uids,fired,total,nextIn,interval,warn,dmg,radius}
    kingBurst:null,             // 骷髅王破体动画 {c,r,x,y,t,dur}
    kingSpawned:false,          // 本局骷髅王是否已经登场（容器只能触发一次）
    kingVesselSpawned:false,    // 容器（带骷髅王的持盾骷髅）是否已经放出过
    thunderWarnings:[],         // 落雷预警 {uid,c,r,timer,total,dmg,radius}
    enemySpeedMul:1,            // 本回合敌方移速倍率（「敌军狂暴」置 1.5，回合结束重置）
    allyDmgMul:1,               // 本回合己方伤害倍率（「火力支援」置 1.3，回合结束重置）
    choiceOpen:false,           // 事件选择模态是否打开（打开期间战场暂停）

    /* ---- 精英 / BOSS 登场演出 ---- */
    introQueue:[],              // 待播放登场介绍的单位 id 队列
    introFreeze:0,              // >0 秒时世界定格（登场演出中）
    introAfter:[],              // 演出结束后才执行的回调（回合推进等）

    /* ---- 商店（仅第二关开放） ---- */
    shop:{ slots:[], refreshLeft:REFRESH_MAX },  // 货架槽位 + 本回合剩余刷新次数
  };

  // 初始化手牌
  for(const id of (cfg.startCards||CARD_ORDER)){
    G.cards[id] = { lv:1, summonCountThisTurn:0 };
    codexMark('player', id);
  }
  /* 选卡：第 4 关起，选中的商店兵种【只决定本关商店卖什么】，不直接送牌 */
  G.draftPicks = (cfg.id >= DRAFT_FROM_LEVEL) ? (DRAFT_PICKS || []).slice() : null;

  // 基地单位（作为可被攻击的目标）
  G.base = {
    uid:0, side:'player', type:'base',
    c:BASE_TILE.c, r:BASE_TILE.r,
    x: tileCenter(BASE_TILE.c,BASE_TILE.r).x,
    y: tileCenter(BASE_TILE.c,BASE_TILE.r).y,
    hp:cfg.baseHp, hpMax:cfg.baseHp,
    isBase:true, alive:true,
  };

  selectedUnit = null;
  hideUnitIntroEl();          // 清掉上一局可能残留的登场介绍横幅

  /* 开局事件：
     - 用于"预创建状态"的调用（还没进入战场，仍在标题界面）不应派发事件链，
       否则第一回合的 reward_pick 会在菜单态被拦截；
     - 真正开打（restart / 入场）时才推进第 1 回合事件。 */
  if(loadingSave){
    /* 读档中：事件链由存档恢复，这里绝不重放开局事件 */
    G.turnPhase = 'event';
  } else if(typeof inMenuScreen!=='function' || !inMenuScreen()){
    startRound(1);
  } else {
    G.turnPhase = 'event';   // 保持事件阶段，等入场后再触发
  }
}

/* ============================================================
   5. 单位工厂
   ============================================================ */
function makeUnit(typeId, side, tile){
  const t = BASE[typeId];
  const c = tile ? tile.c : BASE_TILE.c;
  const r = tile ? tile.r : BASE_TILE.r;
  const p = tileCenter(c,r);
  const u = {
    uid: G.nextUid++,
    typeId, side,
    name:t.name, emoji:t.emoji, kind:t.kind,
    tier: t.tier || null,          // 'elite' | 'boss'（登场介绍 + 战场徽标）
    hostile: !!t.hostile,
    c, r,
    x:p.x, y:p.y,
    hp:t.hp, hpMax:t.hp,
    dmg:t.dmg, range:t.range, atkRate:t.atkRate, moveSpeed:t.moveSpeed,
    lv:1,
    blessed:false,                 // 天官赐福：数值已翻倍（升级后仍保留）
    alive:true,
    // 行为状态
    path:null, pathIdx:0,          // 寻路移动
    target:null,                   // 锁定目标 uid
    atkCd: rnd(0,1/Math.max(t.atkRate,0.001)),  // 攻击冷却
    moving:false,
    aggroR: t.hostile ? 5.2 : 6,   // 索敌半径(格)
    homeTile: {c,r},               // 驻守点（矿工/静止单位）
    isBase:false,
    // ==== 前压防守 ====
    holdLine: !!t.holdLine,        // 近战兵：主动前出到防线
    supportLine: t.kind==='ranged', // 远程兵：推进到支援线
    manualOrder:false,             // 玩家是否下达过移动命令（优先于自动前压）
    autoMove:false,                // 当前是否正在执行自动移动（非玩家命令）
    returnCd:0,                    // 自动移动冷却，避免每帧重算
    // ==== 第二关：怪物特性 ====
    flying:    !!t.flying,         // 飞行：无视地形
    rangedOnly:!!t.rangedOnly,     // 仅远程可选中
    antiMine:  !!t.antiMine,       // 优先攻击矿场（只杀矿工）
    baseOnly:  !!t.baseOnly,       // 只攻击基地（无视玩家单位）
    baseDmgMul:t.baseDmgMul||1,    // 对基地伤害倍率
    shaman:    !!t.shaman,         // 萨满：群体回血 + 受击加攻
    aura:      t.aura||0,          // 统御光环：敌人攻击加成
    stomp:     !!t.stomp,          // 践踏
    stompDmg:  t.stompDmg || 3,    // 践踏伤害（攻城领主强化后为 8）
    // ==== 第二关：玩家兵种特性 ====
    taunt:     t.taunt||0,         // 嘲讽半径（格）
    selfHeal:  t.selfHeal||0,      // 脱战自愈（每秒回血）
    splash:    t.splash||0,        // 溅射比例
    rangedResist: t.rangedResist||0, // 远程伤害减免比例（骷髅 30% / 持盾骷髅 50%）
    raiseFallen:  !!t.raiseFallen,   // 击杀士兵 → 转化为骷髅
    stun:         t.stun||0,         // 命中眩晕时长（圣剑士 0.3 秒）
    stunUntil:0,                     // 被眩晕到的时刻（按 gameTime 计）
    ccResist:   (typeof t.ccResist === 'number') ? clamp(t.ccResist, 0, 1)
                  : ((t.tier === 'elite' || t.tier === 'boss') ? CC_RESIST_TIER : 0),
    graceUsed:false,                 // Lv3「不屈」是否已触发
    graceUntil:0,                    // 「不屈」结束时刻
    // ==== 守卫者（第五关精英）====
    allyAtkAura: t.allyAtkAura||0,   // 光环：在场时友军攻击 +15%
    dmgReduce:   t.dmgReduce||0,     // 石躯：自身受到的所有伤害 -20%
    deathBomb:   t.deathBomb || null,// 阵亡爆炸 { radius, dmg }
    // ==== 骷髅王（第五关 BOSS）====
    spawnTransform: t.spawnTransform||0,          // 出场转化几名我方士兵
    spawnTransformExclude: t.spawnTransformExclude||null,
    minion:      t.minion || null,                // 定时召唤 { typeId, every }
    minionCd:    t.minion ? t.minion.every : 0,   // 首次也是满 10 秒
    deathSummon: t.deathSummon || null,           // 阵亡召唤 { typeId, count }
    vessel:      false,                           // 持盾骷髅：是否"骷髅王的容器"
    // ==== 被动（升级获得）====
    pas:{},                        // 被动标记：shieldwall/counter/volley/pierce/…
    // ==== 计时器 ====
    healCd:0,                      // 萨满回血计时
    healCd2:0,                     // 盾卫自愈计时
    stompCd:0,                     // 践踏计时
    // ==== 毁灭魔龙：定点轰炸 ====
    bombRaid:   !!t.bombRaid,
    bombRadius: t.bombRadius || 2,
    bombDmg:    t.bombDmg    || 20,
    bombWarn:   t.bombWarn   || 3,
    bombCdMax:  t.bombCd     || 10,
    bombCd:     5,                   // 首次施放延迟 5 秒
    atkBuffTimer:0,                // 萨满受击给敌人的加攻持续
    outOfCombat:0,                 // 脱战累计时长（秒）
    lastHurtAt:-99,                // 最近一次受伤时刻（用 gameTime 计）
    slowUntil:-1, slowMul:1,       // 震撼减速
    stompAnim:0,                   // 践踏动画
  };
  codexMark(side, typeId);          // 图鉴：兵种 / 怪兽 首次出现即记录
  return u;
}

/* 卡牌升级倍率应用到单位 */
function applyLevel(u){
  const m = Math.pow(UPGRADE_MULT, u.lv-1);
  const t = BASE[u.typeId];
  const bm = u.blessed ? 2 : 1;   // 天官赐福翻倍标记：升级后祝福仍然保留
  u.hpMax = Math.round(t.hp * m * bm);
  u.hp    = u.hpMax;   // 升级/生成时血量补满（升级是强化，应回满）
  u.dmg   = +(t.dmg   * m * bm).toFixed(2);
  u.range = +(t.range * rangeUpgradeMul(u.lv)).toFixed(2);   // 距离单独线性成长（祝福不翻倍射程）
  u.atkRate = +(t.atkRate * m * bm).toFixed(3);
  u.moveSpeed = +(t.moveSpeed * m * bm).toFixed(3);
  /* 升级被动随等级解锁 */
  applyPassives(u);
}

/* ============================================================
   5b. 升级被动
   ------------------------------------------------------------
   每个兵种 Lv2 一个、Lv3 一个被动；被动挂在 u.pas 上作为标记。
   ============================================================ */
const PASSIVE_TABLE = {
  swordsman: { 2:'shieldwall', 3:'counter' },  // 盾墙(近战受伤-25%) / 反击(反弹40%)
  archer:    { 2:'volley',     3:'pierce'  },  // 连射(30%再射) / 穿透(身后60%)
  miner:     { 2:'prospect',   3:'automation'},// 勘探(+5金) / 自动化(随处产金)
  shield:    { 2:'bulwark',    3:'bond'    },  // 铁壁(受伤-20%) / 羁绊(友军30%伤害转移)
  gunner:    { 2:'demolition', 3:'shock'   },  // 爆破(溅射2格) / 震撼(减速30%)
  holyblade: { 2:'stunSplash', 3:'lastStand'}, // 圣光斩(范围+眩晕×3概率) / 不屈(归零后再战4秒)
};
/* 被动天赋说明表（供卡牌左键详情展示）
   key -> { name, lv, desc }，lv 为解锁等级 */
const PASSIVE_INFO = {
  shieldwall:  { name:'盾墙',   lv:2, desc:'受到近战伤害降低 25%。' },
  counter:     { name:'反击',   lv:3, desc:'被近战攻击命中时，反弹 40% 伤害给攻击者。' },
  volley:      { name:'连射',   lv:2, desc:'射击后有 30% 概率立即再射一次。' },
  pierce:      { name:'穿透',   lv:3, desc:'箭矢命中目标后，对其身后的敌人造成 60% 伤害。' },
  prospect:    { name:'勘探',   lv:2, desc:'每回合结算额外产出 +5 金币。' },
  automation:  { name:'自动化', lv:3, desc:'无需站在矿场，任何位置都能产金。' },
  bulwark:     { name:'铁壁',   lv:2, desc:'受到的所有伤害降低 20%。' },
  bond:        { name:'羁绊',   lv:3, desc:'范围内友军所受伤害的 30% 转移到自己身上。' },
  demolition:  { name:'爆破',   lv:2, desc:'炮击附带 2 格溅射伤害（50%）。' },
  shock:       { name:'震撼',   lv:3, desc:'命中使目标减速 30%，持续 2 秒。' },
  stunSplash:  { name:'圣光斩', lv:2, desc:'攻击变为范围攻击（目标相邻敌人受 50% 伤害），并有 15% 概率眩晕时间 ×3。' },
  lastStand:   { name:'不屈',   lv:3, desc:'生命归零后仍可战斗 4 秒（每场一次）。' },
};
function applyPassives(u){
  u.pas = {};
  const row = PASSIVE_TABLE[u.typeId];
  if(!row) return;
  for(const lv in row){ if(u.lv >= +lv) u.pas[row[lv]] = true; }
}
/* 场上所有同类士兵同步升级 */
function syncFieldUnits(typeId, lv){
  for(const u of G.units){
    if(u.side==='player' && u.typeId===typeId){
      u.lv = lv;
      applyLevel(u);
    }
  }
}

/* ============================================================
   6. 寻路 A*
   ============================================================ */
function passable(c,r){
  if(c<0||r<0||c>=COLS||r>=ROWS) return false;
  const t = terrainAt(c,r);
  if(t && t.passable === false) return false;   // 岩石不可通行
  return true;
}

function aStar(start, goal){
  const key = n=>n.c+','+n.r;
  const open = [{...start, g:0, f:tileDist(start,goal), parent:null}];
  const seen = new Map();
  seen.set(key(start), 0);
  const openMap = new Map();
  openMap.set(key(start), open[0]);

  let guard = 0;
  while(open.length && guard++ < 4000){
    open.sort((a,b)=>a.f-b.f);
    const cur = open.shift();
    openMap.delete(key(cur));

    if(cur.c===goal.c && cur.r===goal.r){
      const path=[];
      let n=cur;
      while(n){ path.unshift({c:n.c,r:n.r}); n=n.parent; }
      return path;
    }

    const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for(const [dc,dr] of dirs){
      const nc=cur.c+dc, nr=cur.r+dr;
      if(!passable(nc,nr)) continue;
      const cost = (dc&&dr)?1.414:1;
      const g = cur.g+cost;
      const k = nc+','+nr;
      if(seen.has(k) && seen.get(k)<=g) continue;
      seen.set(k,g);
      const node={c:nc,r:nr,g,f:g+tileDist({c:nc,r:nr},goal),parent:cur};
      open.push(node);
      openMap.set(k,node);
    }
  }
  return null;
}

/* ============================================================
   7. 回合流程
   ============================================================ */
/* 决定本回合来不来事件、来正还是来负（返回 'pos' | 'neg' | null）
   · 总概率 EV_RATE
   · 配平：优先补次数少的一边，差 ≥1 就补；持平 50/50
   · 硬约束：不连着两个正面；不连着三个负面
   · 若想补的一边被约束挡住，就退到另一边；两边都不行则本回合无事件 */
function pickRoundEvent(){
  if(Math.random() >= EV_RATE) return null;
  if(!G.evLast) G.evLast = [];
  if(!G.evCount) G.evCount = { pos:0, neg:0 };
  const last = G.evLast;
  const canPos = last[0] !== 'pos';
  const canNeg = !(last[0] === 'neg' && last[1] === 'neg');
  let want;
  if(G.evCount.pos < G.evCount.neg)      want = 'pos';
  else if(G.evCount.neg < G.evCount.pos) want = 'neg';
  else                                   want = (Math.random() < 0.5 ? 'pos' : 'neg');
  let evType = null;
  if(want === 'pos' && canPos)      evType = 'pos';
  else if(want === 'neg' && canNeg) evType = 'neg';
  else if(want === 'pos' && canNeg) evType = 'neg';
  else if(want === 'neg' && canPos) evType = 'pos';
  if(evType){
    G.evCount[evType] += 1;
    G.evLast.unshift(evType);
    G.evLast.length = Math.min(G.evLast.length, 2);
  }
  return evType;
}

function startRound(n){
  G.round = n;
  /* 回合开始：只重置行动值；金币产出已在上一回合 endTurn 结算完毕 */
  G.ap = G.apMax;
  G.shop.refreshLeft = REFRESH_MAX;   // 刷新次数每回合重置
  for(const id in G.cards) G.cards[id].summonCountThisTurn = 0;
  G.pendingSummon = null;
  G.selectedUnit = null;

  logLine(`—— 第 ${n} 回合开始 ——`, 'info');

  /* 回合结构（新）：
     ① 事件阶段：奖励三选一 / 随机负面 —— 先选事件
     ② 行动阶段：花钱、买商店、召唤、移动 —— 再分配行动值
     ③ 出怪阶段：本回合的敌人在你排兵布阵【之后】才出现 —— 最后出怪
     出怪事件不再进入事件队列，而是挂到 G.pendingSpawns，等 endTurn 执行。 */
  G.roundEvents = [];
  G.pendingSpawns = [];
  G.enemySpeedMul = 1;      // 「敌军狂暴」等本回合敌方增益在新回合开始时失效
  G.allyDmgMul = 1;         // 「火力支援」等本回合己方增益同样失效
  G.thunder = null;         // 「天打雷劈」残留的落雷在新回合开始时一并清空
  G.thunderWarnings = [];
  if(G.lv.portWaves){
    /* ---- 按出怪口配置的波次（第五关）：left / right / down 各一份列表 ----
       每个口生成一个独立的 spawn 事件，敌人从自己那个口出来、
       走自己那个门（gate），波次表里写"左右各刷一只"就真的是左右各一只。 */
    const pw = G.lv.portWaves[n];
    if(pw){
      if(pw.reward) G.roundEvents.push({ type:'reward_pick' });
      const ports = G.lv.spawnPorts || [];
      for(const p of ports){
        const list = pw[p.key] || [];
        if(list.length) G.pendingSpawns.push({ type:'spawn', port:p.key, list:list.slice() });
      }
    }
  } else if(G.lv.hasLanes){
    /* ---- 双路波次：关卡自带 laneWaves 优先，否则用第二关的 LEVEL2_ROUNDS ---- */
    const wave = (G.lv.laneWaves || LEVEL2_ROUNDS)[n];
    if(wave){
      if(wave.reward) G.roundEvents.push({ type:'reward_pick' });
      if(wave.upper && wave.upper.length) G.pendingSpawns.push({ type:'spawn', lane:'upper', list:wave.upper });
      if(wave.lower && wave.lower.length) G.pendingSpawns.push({ type:'spawn', lane:'lower', list:wave.lower });
    }
  } else {
    /* ---- 单路波次（第一关 / 后续单路关） ----
       出怪倍率 lv.spawnMul：第一关 ×2（"两倍出怪"）。
       直接按条目复制整个列表（monster,monster → 四条 monster），
       而不是简单乘数量 —— 这样「monster + boss」会变成
       两只 monster + 两只 boss，与倍率语义一致。 */
    const wave = G.lv.waves[n];
    if(wave){
      if(wave.reward) G.roundEvents.push({ type:'reward_pick' });
      const mul = Math.max(1, Math.round(G.lv.spawnMul || 1));
      let list = wave.list || [];
      if(list.length && mul>1){
        const grown = [];
        for(let i=0;i<mul;i++) grown.push(...list);
        list = grown;
      }
      if(list.length) G.pendingSpawns.push({ type:'spawn', lane:'lower', list });
    }
  }

  /* ---- 开场垫怪：每关第 1 回合固定放 1 只普通怪（小怪）----
     第一回合原本只有奖励事件、场上空转，加一只小怪让玩家第一回合就有交火。
     直接挂 pendingSpawns（不走波次表），因此【不受出怪倍率影响】——
     第 1 关即使 ×2，开场也仍只有 1 只。 */
  if(n === 1 && G.pendingSpawns.length === 0){
    G.pendingSpawns.push({ type:'spawn', lane:'lower', list:['monster'] });
  }

  // 随机事件（第 2 回合起）—— 归入回合开头的事件阶段，一回合最多一个：
  //   · 总概率 EV_RATE
  //   · 正/负【对等】：优先补出现次数少的那一边（差 ≥1 就补），持平则 50/50
  //   · 硬约束：不连着两个正面；不连着三个负面（约束卡住时宁可不来事件）
  if(n > 1){
    const evType = pickRoundEvent();
    if(evType === 'pos') G.roundEvents.push({ type:'pos_pick' });
    if(evType === 'neg') G.roundEvents.push({ type:'neg_random' });
  }

  /* 出怪预告：登记本回合每个出怪口待出的敌人（布阵时就能看到要来什么） */
  buildSpawnPreview(n);

  G.turnPhase = 'event';
  G.triggerQueue = G.roundEvents.slice();
  G.spawnAfterAction = false;   // 标记：事件队列走完后是"出怪后接敌方阶段"还是"进入行动阶段"
  processNextEvent();
}

/* ---- 第二关波次表（7 回合，双路）---- 加压版
   upper: 上路刷怪（经矿场，会威胁矿工）
   lower: 下路刷怪（直达基地）
   reward: 本回合是否有"三选一"奖励事件
   —— 比初版总量 +35%（26→35 只），且萨满/狼骑/飞行怪提前 1~2 回合出现，
      R6 起形成"两路同时高压"的节奏。 */
const LEVEL2_ROUNDS = {
  1: { reward:true,                          upper:[], lower:[] },
  2: { upper:[],                             lower:['monster','monster','monster','monster'] },
  3: { upper:['monster','monster'],          lower:['monster','monster','shaman'] },
  4: { upper:['sapper','monster','monster'], lower:['monster','monster','monster','shaman'] },
  5: { upper:['sapper','monster','monster'], lower:['monster','monster','monster','wolf','wolf'] },
  6: { upper:['sapper','sapper','shaman'],   lower:['monster','monster','monster','monster','ram','flyer','flyer'] },
  7: { upper:['warlord','sapper','shaman'],  lower:['flyer','flyer','flyer','wolf','wolf'] },
};

function processNextEvent(){
  if(G.triggerQueue.length===0){
    /* 事件队列走完后的去向由 spawnAfterAction 决定：
       - false：回合开头的事件（奖励/负面）走完 → 进入行动阶段
       - true ：这是 endTurn 后的"出怪队列"走完 → 接敌方阶段 + 胜负判定 */
    if(G.spawnAfterAction){
      G.spawnAfterAction = false;
      beginEnemyPhase();
      return;
    }
    // 事件结束 → 进入行动阶段
    G.turnPhase = 'action';
    G.choiceOpen = false;      // 防御：进入行动阶段时必定没有事件模态残留
    showBanner(`第 ${G.round} 回合 · 行动阶段`, 'pos');
    logLine('你可以召唤士兵 / 移动 / 在商店购买（结束后敌人出现）', 'info');
    refreshShop(0, true);              // 进入行动阶段自动免费补货（首回合也刷）
    saveGame();                        // 自动存档（行动阶段快照）
    updateUI();
    return;
  }
  const ev = G.triggerQueue.shift();
  runEvent(ev);
}

/* 负面事件效果表（供"二选一"事件使用） */
const NEG_EVENTS = {
  base_dmg: {
    name:'基地受损',
    desc:'基地直接受到 2~4 点伤害',
    apply(){
      const d = rndInt(2,4);
      damageBase(d, '负面事件：基地受损');
    },
  },
  lose_gold: {
    name:'小偷来袭',
    desc:'损失 10 金币（金币不足则全部偷走）',
    apply(){
      const d = Math.min(G.gold, 10);
      G.gold -= d;
      showBanner(`负面事件：小偷来袭，损失 ${d} 金币`, 'neg');
      logLine(`负面事件：损失 ${d} 金币`, 'neg');
    },
  },
  monster_buff: {
    name:'敌军狂暴',
    desc:'本回合敌方移动速度变为 1.5 倍',
    apply(){
      G.enemySpeedMul = 1.5;
      showBanner('负面事件：敌军狂暴，本回合敌方移速 ×1.5', 'neg');
      logLine('负面事件：敌军狂暴（本回合敌方移动速度 ×1.5）', 'neg');
    },
  },
  fatigue: {
    name:'全军疲惫',
    desc:'本回合行动值 -1（至少保留 1 点）',
    apply(){
      const before = G.ap;
      G.ap = Math.max(1, G.ap-1);
      showBanner(`负面事件：全军疲惫，行动值 ${before}→${G.ap}`, 'neg');
      logLine(`负面事件：全军疲惫（行动值 -1）`, 'neg');
    },
  },
  heavy_tax: {
    name:'苛捐杂税',
    desc:'失去当前持有金币的 30%',
    apply(){
      const d = Math.floor(G.gold * 0.3);
      G.gold -= d;
      showBanner(`负面事件：苛捐杂税，损失 ${d} 金币`, 'neg');
      logLine(`负面事件：苛捐杂税（-30% 金币，共 ${d}）`, 'neg');
    },
  },
  thunder: {
    name:'天打雷劈',
    desc:'锁定 2 名己方单位，落下 5 道雷（每道 7 伤，半径 1 格，不伤基地）',
    apply(){
      /* 随机锁定 2 名己方存活单位（基地免疫，不参与锁定） */
      const pool = G.units.filter(u=>u.alive && u.side==='player' && !u.isBase);
      const uids = [];
      const tmp = pool.slice();
      for(let i=0;i<2 && tmp.length;i++){
        const k = rndInt(0, tmp.length-1);
        uids.push(tmp[k].uid);
        tmp.splice(k,1);
      }
      if(!uids.length){
        showBanner('负面事件：天打雷劈（场上无可锁定的己方单位，无功而返）', 'neg');
        logLine('负面事件：天打雷劈（无可锁定目标）', 'neg');
        return;
      }
      for(const uid of uids){
        const u = G.units.find(x=>x.uid===uid);
        if(!u) continue;
        G.flashTiles.push({ c:u.c, r:u.r, life:2.5, color:'#8ecbff' });
        showFloat(u.x, u.y-30, '⚡ 被锁定', '#8ecbff');
      }
      /* 5 道雷：每道 2 秒预警，雷与雷间隔 3 秒；半径 1 格、7 点伤害、不劈基地 */
      G.thunder = {
        uids, fired:0, total:5,
        nextIn:0,      // 第一道雷立刻进入预警
        interval:3,    // 雷与雷的间隔（秒）
        warn:2,        // 每道雷的预警时长（秒）
        dmg:7, radius:1,
      };
      showBanner('负面事件：天打雷劈！2 名单位被锁定，5 道雷即将落下', 'neg');
      logLine(`负面事件：天打雷劈（锁定 ${uids.length} 名单位：5 道雷 ×7 伤，半径 1 格，不伤基地）`, 'neg');
    },
  },
};

/* 负面事件抽取权重：天打雷劈是灾难级，压低到 0.35（约 6.5% 命中率，其余各约 18.7%） */
const NEG_EVENT_WEIGHT = {
  base_dmg:1, lose_gold:1, monster_buff:1, fatigue:1, heavy_tax:1,
  thunder:0.35,
};
/* 按权重抽一个负面事件 id */
function drawNegEvent(){
  const ids = Object.keys(NEG_EVENTS);
  let total = 0;
  for(const id of ids) total += (NEG_EVENT_WEIGHT[id] != null ? NEG_EVENT_WEIGHT[id] : 1);
  let r = Math.random() * total;
  for(const id of ids){
    r -= (NEG_EVENT_WEIGHT[id] != null ? NEG_EVENT_WEIGHT[id] : 1);
    if(r <= 0) return id;
  }
  return ids[ids.length - 1];
}

/* 增益事件效果表（"空投支援二选一"用） */
const POS_EVENTS = {
  airdrop_wage: {
    name:'空投军饷',
    emoji:'💰',
    desc:'立即获得 20 金币',
    apply(){
      G.gold += 20;
      showBanner('事件：空投军饷，+20 金币', 'gold');
      logLine('事件：空投军饷（+20 金币）', 'gold');
    },
  },
  mobilize: {
    name:'战前动员',
    emoji:'⚡',
    desc:'本回合行动值 +2（可突破上限）',
    apply(){
      G.ap += 2;   // 事件在回合开头触发，此时 ap 已满 —— 必须允许破上限，否则事件无效
      showBanner(`事件：战前动员，行动值 +2（当前 ${G.ap}）`, 'pos');
      logLine('事件：战前动员（行动值 +2，可突破上限）', 'pos');
    },
  },
  repair: {
    name:'基地修缮',
    emoji:'🛠️',
    desc:'基地回复 8 点生命',
    apply(){
      const before = G.baseHp;
      G.baseHp = Math.min(G.baseHpMax, G.baseHp+8);
      G.base.hp = G.baseHp;
      showFloat(G.base.x, G.base.y-20, `+${G.baseHp-before}`, '#5ddc7a');
      showBanner(`事件：基地修缮，+${G.baseHp-before} 生命`, 'pos');
      logLine(`事件：基地修缮（基地 +${G.baseHp-before} 生命）`, 'pos');
    },
  },
  fire_support: {
    name:'火力支援',
    emoji:'🔥',
    desc:'本回合己方全体攻击伤害 +30%（回合结束失效）',
    apply(){
      G.allyDmgMul = 1.3;
      showBanner('事件：火力支援，本回合己方伤害 +30%', 'pos');
      logLine('事件：火力支援（己方攻击伤害 ×1.3，本回合有效）', 'pos');
    },
  },
  divine_soldier: {
    name:'天降神兵',
    emoji:'⚔️',
    weight:0.25,   // 低概率稀有事件（其余事件缺省权重 1）
    desc:'召唤 1 名守卫者（80 血 / 3 攻）降临基地旁；场上已有守卫者则改为把它修满',
    apply(){
      /* 守卫者场上限 1：已经有活的守卫者，就不再叠一只，改为把它修复回满血 */
      const exist = G.units.find(x=>x.alive && x.side==='player' && x.typeId==='guardian');
      if(exist){
        exist.hp = exist.hpMax;
        exist.graceUntil = 0;
        showFloat(exist.x, exist.y-30, '⚔️ 守卫者修复', '#ffe089');
        G.flashTiles.push({ c:exist.c, r:exist.r, life:1.6, color:'#ffe089' });
        showBanner('事件：天降神兵！守卫者已被修满（场上限 1 名）', 'pos');
        logLine('事件：天降神兵（场上已有守卫者，改为修复满血）', 'pos');
        return;
      }
      const t = spawnNearBase();
      const u = makeUnit('guardian', 'player', t);
      applyLevel(u);
      G.units.push(u);   // 事件白送单位：不占召唤次数
      showFloat(u.x, u.y-30, '⚔️ 天降神兵', '#ffe089');
      G.flashTiles.push({ c:u.c, r:u.r, life:2.5, color:'#ffe089' });
      showBanner('事件：天降神兵！守卫者降临（80 血 / 3 攻）', 'pos');
      logLine('事件：天降神兵（获得 1 名守卫者：80 血 / 3 攻）', 'pos');
    },
  },
  blessing: {
    name:'天官赐福',
    emoji:'✨',
    desc:'随机 1 名己方单位数值翻倍（血/攻/攻速/移速，射程除外）',
    apply(){
      /* 优先赐福可战斗单位；全体都已被赐福过则不重复叠加 */
      let cand = G.units.filter(u=>u.alive && u.side==='player' && !u.isBase && !u.blessed);
      const fighters = cand.filter(u=>u.kind!=='none');
      if(fighters.length) cand = fighters;
      if(!cand.length){
        G.gold += 20;
        showBanner('事件：天官赐福（无可赐福目标，折现 +20 金币）', 'pos');
        logLine('事件：天官赐福落空，折现 +20 金币', 'gold');
        return;
      }
      const u = cand[rndInt(0, cand.length-1)];
      u.blessed = true;
      u.hpMax = Math.round(u.hpMax*2);
      u.hp    = Math.min(u.hpMax, u.hp*2);   // 当前血量一并翻倍
      u.dmg   = +(u.dmg*2).toFixed(2);
      u.atkRate = +(u.atkRate*2).toFixed(3);
      u.moveSpeed = +(u.moveSpeed*2).toFixed(3);
      showFloat(u.x, u.y-30, '✨ 数值翻倍!', '#ffe089');
      G.flashTiles.push({ c:u.c, r:u.r, life:2.5, color:'#ffe089' });
      showBanner(`事件：天官赐福！【${u.name}】数值翻倍`, 'pos');
      logLine(`事件：天官赐福（【${u.name}】血/攻/攻速/移速 ×2，升级后保留）`, 'pos');
    },
  },
};

/* 加权抽取 2 个不同的增益事件（weight 越低越稀有，缺省按 1 计） */
function drawPosEventPair(){
  const pool = Object.keys(POS_EVENTS);
  const pick = (exclude)=>{
    let total = 0;
    for(const id of pool){ if(id!==exclude) total += (POS_EVENTS[id].weight || 1); }
    let roll = Math.random() * total;
    for(const id of pool){
      if(id===exclude) continue;
      roll -= (POS_EVENTS[id].weight || 1);
      if(roll <= 0) return id;
    }
    return pool.find(id=>id!==exclude);
  };
  const a = pick(null);
  return [a, pick(a)];
}

/* 结算 overlay 是「单占用」资源：胜负结算 / 负面事件 / 增益事件 / 援军奖励 /
   天赋详情共用同一个容器。任何弹窗打开前必须清掉上一次占用的全部痕迹，
   否则会出现（实拍 bug）：
   - 上一局胜负结算的「进入下一关 / 重打本关」按钮残留在事件弹窗里
   - 上一回合的负面事件选项卡片与本次的奖励卡片同时叠在弹窗里
   - 天赋详情改过的「关闭」按钮文字 / onclick 泄漏到事件模态 */
const OVERLAY_WRAP_IDS = ['reward-choices', 'neg-choices', 'pos-choices'];
function resetOverlayForModal(){
  for(const id of OVERLAY_WRAP_IDS){
    const el = document.getElementById(id);
    if(el && el.remove) el.remove();
  }
  const nb = $('overlay-next'), rb = $('overlay-retry');
  if(nb){ nb.style.display = 'none'; nb.onclick = null; }
  if(rb){ rb.style.display = 'none'; rb.onclick = null; }
  const btn = $('overlay-btn');
  btn.textContent = '';
  btn.onclick = null;
}

/* 事件"多选一"模态（负面二选一 / 增益二选一共用）
   prefix: 弹窗容器 id 前缀；options: [{id,name,desc,emoji}]；onPick(id) 选择回调 */
function openChoiceModal(prefix, title, subtitle, options, onPick){
  if(G.phase!=='playing') return false;
  if(inMenuScreen()) return false;
  resetOverlayForModal();
  const box = $('overlay-box');
  const ov = $('overlay');
  $('overlay-title').textContent = title;
  $('overlay-title').className='';
  $('overlay-desc').innerHTML = subtitle;
  const btn = $('overlay-btn');
  btn.style.display='none';

  const old = document.getElementById(prefix+'-choices');
  if(old) old.remove();

  const wrap = document.createElement('div');
  wrap.id = prefix+'-choices';
  wrap.style.cssText='display:flex;gap:14px;justify-content:center;margin-bottom:6px;flex-wrap:wrap';
  options.forEach(op=>{
    const d = document.createElement('button');
    d.className='big-btn';
    d.style.width='190px';
    d.innerHTML = `<div style="font-size:26px;margin-bottom:8px">${op.emoji||'⚠️'}</div>
      ${op.name}<div style="font-size:8px;margin-top:8px;opacity:.85">${op.desc}</div>`;
    d.onclick = ()=>{ closeChoiceModal(prefix); onPick(op.id); };
    wrap.appendChild(d);
  });
  const btns = box.querySelector('.overlay-btns');
  if(btns && btns.parentNode === box){
    box.insertBefore(wrap, btns);
  } else {
    box.appendChild(wrap);
  }
  sfx('event');                      // 事件提示音
  ov.classList.remove('hidden');
  G.choiceOpen = true;               // 暂停战场：选完事件再恢复推进
  return true;
}
function closeChoiceModal(prefix){
  $('overlay').classList.add('hidden');
  const old = document.getElementById(prefix+'-choices');
  if(old) old.remove();
  $('overlay-btn').style.display='';
  G.choiceOpen = false;              // 关闭 → 恢复战场推进
}

/* 负面事件"二选一"模态：随机抽 2 个，玩家选承受哪个（返回 true=已弹出） */
function openNegModal(ids){
  const opts = ids.map(id=>({ id, name:NEG_EVENTS[id].name, desc:NEG_EVENTS[id].desc }));
  return openChoiceModal('neg', '事件 · 麻烦来了', '不速之扰！选择你要承受的一项：', opts,
    (id)=> resolveNegEvent(id));
}
function closeNegModal(){ closeChoiceModal('neg'); }
function resolveNegEvent(id){
  if(G.choiceOpen) closeNegModal();   // 关闭模态 → 解除战场暂停
  const ev = NEG_EVENTS[id];
  if(ev) ev.apply();
  processNextEvent();
}

/* 增益事件"二选一"模态：随机抽 2 个，玩家选领取哪个（返回 true=已弹出） */
function openPosModal(ids){
  const opts = ids.map(id=>({ id, name:POS_EVENTS[id].name, desc:POS_EVENTS[id].desc, emoji:POS_EVENTS[id].emoji }));
  return openChoiceModal('pos', '事件 · 空投支援', '好消息！选择你要领取的一项：', opts,
    (id)=> resolvePosEvent(id));
}
function closePosModal(){ closeChoiceModal('pos'); }
function resolvePosEvent(id){
  if(G.choiceOpen) closePosModal();   // 关闭模态 → 解除战场暂停
  const ev = POS_EVENTS[id];
  if(ev){
    showEventCard('pos', ev.name, ev.desc, 2.2);
    ev.apply();
  }
  processNextEvent();
}

/* ============================================================
   7b. 精英 / BOSS 登场介绍
   ------------------------------------------------------------
   出怪列表里出现 tier 单位（攻城领主 = 精英 / 毁灭魔龙 = BOSS）时：
     ① 世界短暂定格（暂停推演），敌人原地待命
     ② 全屏横幅播报：标签 + 名称 + 英文名 + 能力清单
     ③ 播放专属登场音效
   多个精英/BOSS 同波出现时逐个播完（队列）。
   ============================================================ */
const INTRO_DUR = 2.6;          // 单个单位登场演出时长（秒）

function showUnitIntroEl(tid){
  const info = UNIT_INTRO[tid];
  if(!info) return;
  const el = $('unit-intro');
  if(!el) return;
  const ti = TIER_INFO[info.tier] || TIER_INFO.elite;
  el.className = 'tier-' + info.tier;
  const tierEl = $('ui-tier');
  if(tierEl){ tierEl.textContent = ti.label; tierEl.style.color = ti.color; }
  const artEl = $('ui-art');
  if(artEl) artEl.textContent = info.emoji;
  const nameEl = $('ui-name');
  if(nameEl){ nameEl.textContent = info.name; nameEl.style.color = ti.color; }
  const enEl = $('ui-en');
  if(enEl) enEl.textContent = `${ti.en} · ${info.en || ''}`.trim();
  const tagEl = $('ui-tag');
  if(tagEl) tagEl.textContent = info.tagline || '';
  const ulEl = $('ui-lines');
  if(ulEl) ulEl.innerHTML = (info.lines || [])
    .map((t, i) => `<li style="animation-delay:${(0.35 + i * 0.22).toFixed(2)}s">${t}</li>`).join('');
  el.classList.remove('hidden');
}
function hideUnitIntroEl(){
  const el = $('unit-intro');
  if(el){ el.classList.add('hidden'); el.classList.remove('show'); }
}

/* 播放队列中的下一个；队列空 → 解除定格并执行挂起的回调 */
function startNextIntro(){
  if(!G) return;
  const q = G.introQueue || (G.introQueue = []);
  const tid = q.shift();
  if(!tid){
    G.introFreeze = 0;
    hideUnitIntroEl();
    flushIntroAfter();
    return;
  }
  const info = UNIT_INTRO[tid] || {};
  const ti = TIER_INFO[info.tier] || TIER_INFO.elite;
  showUnitIntroEl(tid);
  G.introFreeze = INTRO_DUR;
  showBanner(`${ti.label}登场：${info.name}！`, 'neg');
  logLine(`⚠ ${ti.label}【${info.name}】踏入战场 —— ${info.tagline || ''}`, 'neg');
  sfx(info.tier === 'boss' ? 'boss' : 'elite');
}

/* 把单位 id 列表排入登场演出队列（自动去重 + 过滤非精英单位）
   返回 true 表示确实有演出被安排 */
function queueUnitIntro(tids){
  if(!G) return false;
  const uniq = [];
  for(const t of (tids || [])){
    if(UNIT_INTRO[t] && uniq.indexOf(t) < 0) uniq.push(t);
  }
  if(!uniq.length) return false;
  G.introQueue = (G.introQueue || []).concat(uniq);
  if(!(G.introFreeze > 0)) startNextIntro();
  return true;
}

/* 演出倒计时（由 update 每帧驱动）；归零后接上下一个/回调 */
function tickIntro(dt){
  if(!G || !(G.introFreeze > 0)) return;
  G.introFreeze -= dt;
  if(G.introFreeze <= 0) startNextIntro();
}

/* 演出结束后要执行的动作（如回合推进），避免演出中被打断 */
function afterIntro(fn){
  if(G && G.introFreeze > 0){
    (G.introAfter = G.introAfter || []).push(fn);
    return;
  }
  fn();
}
function flushIntroAfter(){
  if(!G) return;
  const q = G.introAfter || [];
  G.introAfter = [];
  for(const f of q){ try{ f(); }catch(e){ /* 单个回调失败不影响其余 */ } }
}
/* 立即中止全部登场演出（结算 / 重开时调用） */
function clearUnitIntro(){
  if(!G) return;
  G.introQueue = [];
  G.introFreeze = 0;
  G.introAfter = [];
  hideUnitIntroEl();
}

function runEvent(ev){
  switch(ev.type){
    /* ---- 事件奖励：获得 剑士 / 弓箭手 / 矿工（三选一） ---- */
    case 'reward_pick': {
      showBanner('事件：援军抵达！选择一个士兵加入战场', 'pos');
      logLine('事件：援军抵达（剑士 / 弓箭手 / 矿工）', 'pos');
      pendingReward = ['swordsman','archer','miner'];
      const opened = openRewardModal(['swordsman','archer','miner']);
      if(opened === false){
        /* 弹窗被拦截（仍处在标题 / 选关 / 简报界面）：
           不能就此 return 吞掉事件链，否则回合会永远卡在"事件处理中…"。
           把事件放回队首，等真正进入战场后再重试。 */
        pendingReward = null;
        G.triggerQueue.unshift(ev);
        updateUI();
        return;
      }
      return;  // 等玩家选择后 resolveReward 继续
    }

    /* ---- 刷怪（指定路线） ---- */
    case 'spawn': {
      const placed=[];
      const tiers=[];              // 本波出现的精英 / BOSS（触发登场演出）
      for(const tid of ev.list){
        const t = spawnLaneTile(ev.lane, tid, ev.port);
        if(!t) continue;
        const u = makeUnit(tid, 'enemy', t);
        /* 进路口：双路关用 laneGate（上下路各一个），
           多出怪口的关（第五关）用"这个口自己的 gate"——
           左口走左门、右口走右门、下口走南门，各自绕自己那一边 */
        const gate = laneGateFor(ev.lane) || (lastSpawnPort && lastSpawnPort.gate);
        if(gate) u.gate = { c:gate.c, r:gate.r };   // 先走本路岔口，再恢复正常寻路
        /* 骷髅王的容器：本关（配置 kingVessel）第一只持盾骷髅，倒下时会钻出骷髅王。
           kingVesselWave 指定"第几波那一只才是容器"——第五关配的是第 7 波，
           所以第 5 波那只普通持盾骷髅不会提前把骷髅王放出来。 */
        if(tid === 'skullguard' && G.lv && G.lv.kingVessel && !G.kingVesselSpawned
           && (!G.lv.kingVesselWave || G.round >= G.lv.kingVesselWave)){
          u.vessel = true;
          G.kingVesselSpawned = true;
          showFloat(u.x, u.y-26, '容器', '#c9a6ff');
          logLine('这只持盾骷髅身上缠着不对劲的骨头 —— 它倒下时可能会有东西钻出来', 'neg');
        }
        G.units.push(u);
        placed.push(BASE[tid].name);
        if(BASE[tid].tier) tiers.push(tid);
      }
      consumeSpawnPreview(ev.port || ev.lane, ev.list);   // 出怪口预告同步扣减
      if(placed.length){
        const laneName = (lastSpawnPort && lastSpawnPort.label)
          || (ev.lane==='upper' ? '上路（矿场方向）' : '下路（基地方向）');
        if(!tiers.length) showBanner(`${laneName} 敌人出现：${placed.join(' + ')}！`, 'neg');
        logLine(`⚠ ${laneName} 出现敌人：${placed.join(' + ')}`, 'neg');
      }
      /* 精英 / BOSS：世界短暂定格 + 专属登场介绍（横幅由演出接管） */
      if(tiers.length) queueUnitIntro(tiers);
      break;
    }

    /* ---- 增益事件（空投支援二选一，加权抽取：天降神兵低概率） ---- */
    case 'pos_pick': {
      showBanner('事件：空投支援！选择你要领取的一项', 'pos');
      const [posA, posB] = drawPosEventPair();
      logLine(`事件：空投支援二选一（${POS_EVENTS[posA].name} / ${POS_EVENTS[posB].name}）`, 'pos');
      const opened = openPosModal([posA, posB]);
      if(opened === false){
        G.triggerQueue.unshift(ev);
        updateUI();
        return;
      }
      return;  // 玩家选择后 resolvePosEvent 继续
    }

    /* ---- 随机负面事件（二选一） ---- */
    case 'neg_random': {
      /* 负面事件：直接触发，不再让玩家二选一；但要在屏幕上明确播报出来 */
      const id = drawNegEvent();
      const ne = NEG_EVENTS[id];
      logLine(`事件：负面事件【${ne.name}】`, 'neg');
      showEventCard('neg', ne.name, ne.desc, 2.4);
      ne.apply();
      break;   // 落到函数末尾：updateUI + 900ms 后继续下一个事件
    }
  }
  updateUI();
  // 延迟后继续下一个事件
  setTimeout(()=>{ if(G.phase==='playing' && G.turnPhase==='event') processNextEvent(); }, 900);
}

/* 事件奖励选择完成后调用 */
function resolveReward(choice){
  if(G.choiceOpen) closeRewardModal();   // 关闭模态 → 解除战场暂停
  /* 确保奖励的兵种其卡片存在（矿工等已在手牌；新卡不参与奖励） */
  if(!G.cards[choice]) G.cards[choice] = { lv:1, summonCountThisTurn:0 };
  const t = spawnNearBase(true);
  const u = makeUnit(choice, 'player', t);
  u.lv = G.cards[choice].lv; applyLevel(u);
  G.units.push(u);
  /* 事件奖励是白送的援军，不占用该卡本回合的召唤次数 */
  const nm = BASE[choice].name;
  showBanner(`获得援军：${nm}！`, 'pos');
  logLine(`事件奖励：获得 1 个 ${nm}`, 'pos');
  updateUI();
  setTimeout(()=>{ if(G.phase==='playing' && G.turnPhase==='event') processNextEvent(); }, 700);
}

/* ============================================================
   出怪预告（出怪口 HUD）
   ------------------------------------------------------------
   回合一开始（startRound）就把本回合的波次登记成"待出清单"，
   玩家在布阵时就能看到每个出怪口接下来会放出什么怪；
   每批怪真正刷出时从清单里扣掉，全部出完标记 done。
   ============================================================ */
function makeSpawnPreview(round){
  const pv = {
    round: round | 0,
    upper: { queue:[], has:false, done:false },
    lower: { queue:[], has:false, done:false },
  };
  /* 多出怪口（第五关）：每个口一份独立预告，key = left / right / down */
  const ps = G && G.lv && G.lv.spawnPorts;
  if(ps && ps.length){
    for(const p of ps){
      if(p.key && !pv[p.key]) pv[p.key] = { queue:[], has:false, done:false };
    }
  }
  return pv;
}
/* 按当前 G.pendingSpawns 重建本回合出怪预告 */
function buildSpawnPreview(round){
  const pv = makeSpawnPreview(round);
  for(const ev of (G.pendingSpawns || [])){
    if(ev.type !== 'spawn' || !ev.list || !ev.list.length) continue;
    /* 指定了出怪口就记在口名下，否则退回上下路 */
    const key = (ev.port && pv[ev.port]) ? ev.port : ((ev.lane === 'upper') ? 'upper' : 'lower');
    pv[key].queue.push(...ev.list);
    pv[key].has = true;
  }
  for(const key in pv){
    const s = pv[key];
    if(s && typeof s === 'object' && 'queue' in s) s.done = s.has && s.queue.length === 0;
  }
  G.spawnPreview = pv;
  return pv;
}
/* 某批怪已刷出：从预告里逐个扣掉（同类型按数量扣） */
function consumeSpawnPreview(lane, list){
  const pv = G.spawnPreview;
  if(!pv) return;
  const slot = pv[lane] || pv[(lane === 'upper') ? 'upper' : 'lower'];
  if(!slot || !list) return;
  for(const tid of list){
    const i = slot.queue.indexOf(tid);
    if(i >= 0) slot.queue.splice(i,1);
  }
  slot.done = slot.has && slot.queue.length === 0;
}
/* 预告里还剩下什么（测试 / 调试用）：返回 [{ typeId, count, emoji, name }] */
function spawnPreviewRemain(lane){
  const pv = G.spawnPreview;
  const slot = pv && (pv[lane] || pv[(lane === 'upper') ? 'upper' : 'lower']);
  if(!slot || !slot.queue.length) return [];
  const out = [];
  for(const tid of slot.queue){
    const hit = out.find(o => o.typeId === tid);
    if(hit) hit.count++;
    else out.push({ typeId:tid, count:1, emoji:BASE[tid].emoji, name:BASE[tid].name });
  }
  return out;
}

/* 双路关的「进路口」：从出怪口出来的兵，先各自走到本路的岔口，再恢复正常寻路。
   只有在上下两条路"一样长"的地图（如第四关）才需要 —— 否则寻路会两条路乱选。
   关卡配置写 laneGate:{ upper:{c,r}, lower:{c,r} }，不写则不启用。 */
function laneGateFor(lane){
  const g = G && G.lv && G.lv.laneGate;
  if(!g) return null;
  return (lane === 'upper' ? g.upper : g.lower) || null;
}

/* 持盾骷髅的被动：倒下的士兵变成骷髅（原地起身，立刻算敌方单位） */
function raiseSkeleton(fallen){
  if(!G || !G.units || !BASE.skeleton || !fallen) return null;
  const s = makeUnit('skeleton', 'enemy', { c: fallen.c, r: fallen.r });
  s.raisedFrom = fallen.typeId || null;
  G.units.push(s);
  showFloat(fallen.x, fallen.y-28, '骷髅化!', '#c9a6ff');
  logLine(`【持盾骷髅】把倒下的【${fallen.name}】变成了骷髅`, 'neg');
  return s;
}

/* ============================================================
   骷髅王（第五关 BOSS）
   ------------------------------------------------------------
   出场链路：持盾骷髅（容器 vessel）倒下
        → 破体动画 KING_BURST_DUR 秒（尸体抽搐 → 骨刺隆起 → 白闪）
        → 在它倒下的格子上现身 → BOSS 登场弹窗 + 15 秒专属 BGM
        → 顺手把场上 2 名我方士兵变成骷髅（守卫者免疫）
   之后：每 10 秒召唤 1 个骷髅；自己倒下时再召唤 2 个。
   ============================================================ */
const KING_BURST_DUR = 2.2;         // 破体动画时长（秒）
const KING_BGM_SEC   = 15;          // 专属 BGM 时长（秒）

/* 在 unit 周围找一个空着的邻格（找不到就返回 null） */
function freeTileNear(unit, radius){
  const R = radius || 1;
  const cands = [];
  for(let dc=-R; dc<=R; dc++){
    for(let dr=-R; dr<=R; dr++){
      if(!dc && !dr) continue;
      const c = unit.c+dc, r = unit.r+dr;
      if(!passable(c,r)) continue;
      if(occupiedAt(c,r)) continue;
      if(c===BASE_TILE.c && r===BASE_TILE.r) continue;
      if(isMineTile(c,r)) continue;
      cands.push({ c, r, d: Math.hypot(dc,dr) });
    }
  }
  cands.sort((a,b)=>a.d-b.d);
  return cands.length ? { c:cands[0].c, r:cands[0].r } : null;
}

/* 在 unit 周围召唤 count 个 typeId（骷髅王召唤骷髅 / 阵亡召唤共用） */
function summonMinionsAround(unit, typeId, count){
  if(!G || !G.units || !BASE[typeId]) return [];
  const out = [];
  for(let i=0;i<count;i++){
    let t = freeTileNear(unit, 1);
    if(!t) t = freeTileNear(unit, 2);
    if(!t) break;
    const m = makeUnit(typeId, 'enemy', t);
    G.units.push(m);
    out.push(m);
  }
  return out;
}

/* 容器倒下：开始播放破体动画（动画结束后才真正生成骷髅王） */
function startKingBurst(unit){
  if(!G || G.kingSpawned || G.kingBurst) return;
  G.kingBurst = {
    c: unit.c, r: unit.r, x: unit.x, y: unit.y,
    t: 0, dur: KING_BURST_DUR,
  };
  sfx('boss');
  showFloat(unit.x, unit.y-30, '骨……在动?!', '#c9a6ff');
  logLine('⚠ 持盾骷髅的躯壳开始抖动 —— 有什么东西要从里面钻出来了', 'neg');
}

/* 动画结束：在容器倒下的位置生成骷髅王 */
function spawnKingAt(c, r){
  if(!G || G.kingSpawned) return null;
  const t = (passable(c,r) && !occupiedAt(c,r)) ? { c, r } : (freeTileNear({c,r}, 2) || { c, r });
  const k = makeUnit('skullking', 'enemy', t);
  G.units.push(k);
  G.kingSpawned = true;
  showFloat(k.x, k.y-40, '👑 骷髅王!', '#ffcf4d');
  for(let dc=-2; dc<=2; dc++){
    for(let dr=-2; dr<=2; dr++){
      if(dc*dc + dr*dr > 4) continue;
      G.flashTiles.push({ c:t.c+dc, r:t.r+dr, life:0.8, color:'#ffcf4d' });
    }
  }
  /* ① 出场即夺走 2 名我方士兵（守卫者免疫） */
  const grabbed = kingGrabAllies(k);
  /* ② BOSS 弹窗（复用精英/BOSS 登场演出）+ 15 秒专属 BGM */
  queueUnitIntro(['skullking']);
  playBossBgm(KING_BGM_SEC);
  logLine(`👑 骷髅王破体而出${grabbed.length?`，并把 ${grabbed.map(u=>u.name).join('、')} 化为骷髅`:''}`, 'neg');
  return k;
}

/* 骷髅王出场被动：把离它最近的最多 N 名我方士兵转化为骷髅（不含矿工 / 守卫者） */
function kingGrabAllies(king){
  const n = king.spawnTransform || 0;
  if(!n) return [];
  const ex = king.spawnTransformExclude || [];
  const cands = G.units.filter(u =>
    u.alive && u.side==='player' && !u.isBase && u.kind!=='none' &&
    ex.indexOf(u.typeId) < 0);
  cands.sort((a,b)=> tileDist(a,king) - tileDist(b,king));
  const picked = cands.slice(0, n);
  for(const u of picked){
    u.alive = false;
    if(u.uid===G.selectedUnit) G.selectedUnit = null;
    const sk = raiseSkeleton(u);
    if(sk){ sk.raisedFrom = null; }
  }
  return picked;
}

/* 骷髅王还没正式登场前，这一关【不算打完】—— 撑过去不算赢：
   ① 容器（被附体的持盾骷髅）还活着 → 必须先打死它
   ② 容器刚倒下、破体动画还在播 → 这 2.2 秒里场上确实"没有敌人"，
      但骷髅王马上就要钻出来，绝不能在这时候判胜（否则动画被 endGame 掐掉）
   骷髅王登场之后（kingSpawned）就恢复常规清场判定：打死它才算赢。 */
function kingPending(){
  if(!G || !G.lv || !G.lv.kingVessel) return false;
  if(G.kingSpawned) return false;
  if(G.kingBurst) return true;
  return G.units.some(u => u.vessel && u.alive);
}

/* 每帧推进破体动画 */
function tickKingBurst(dt){
  const b = G && G.kingBurst;
  if(!b) return;
  b.t += dt;
  if(b.t >= b.dur){
    G.kingBurst = null;
    spawnKingAt(b.c, b.r);
  }
}

/* 守卫者阵亡爆炸：以自身为中心 radius 格内的敌人受 dmg 点伤害。
   只打敌人 —— 不打基地、不误伤友军；爆炸本身不再触发反击/转化等二次效果。 */
function guardianDetonate(u){
  const bomb = u.deathBomb;
  if(!bomb || !G || !G.units) return;
  sfx('explode');
  let hit = 0;
  for(const e of G.units){
    if(!e.alive || e.side !== 'enemy') continue;
    if(tileDist(e, u) > bomb.radius) continue;
    damageUnit(e, bomb.dmg, null, {});
    hit++;
  }
  showFloat(u.x, u.y-34, '💥 石爆!', '#ffd45a');
  for(let dc=-bomb.radius; dc<=bomb.radius; dc++){
    for(let dr=-bomb.radius; dr<=bomb.radius; dr++){
      if(dc*dc + dr*dr > bomb.radius*bomb.radius) continue;
      G.flashTiles.push({ c:u.c+dc, r:u.r+dr, life:0.6, color:'#ffd45a' });
    }
  }
  logLine(`【守卫者】崩解爆炸：${bomb.radius} 格内 ${hit} 名敌人各受 ${bomb.dmg} 伤`, 'pos');
}

/* 按路线取刷怪格：上路围绕 SPAWN_UPPER，下路围绕 SPAWN_LOWER；
   配了 spawnPorts 的关（第五关）则按顺序轮流用各个出怪口 */
function spawnLaneTile(lane, tid, portKey){
  const origin = nextSpawnPort(portKey) || (lane==='upper' ? SPAWN_UPPER : SPAWN_LOWER);
  const sp = SPAWN_SPREAD;
  const okAt = (c, r) =>
    passable(c,r) && !occupiedAt(c,r) &&
    !(c===BASE_TILE.c && r===BASE_TILE.r) &&
    !isMineTile(c,r);                      // 矿场 4 格都不能刷怪
  /* 先在正常散布范围内随机找；一个口一次涌出很多只（比如第 6 波各 7 只）时
     邻格会被占满 —— 这时逐级放大半径，宁可站得散一点，也不要挤成一坨。 */
  for(let grow=0; grow<=4; grow++){
    const rc = sp.c + grow, rr = sp.r + grow;
    for(let i=0;i<160;i++){
      const c = clamp(origin.c + rndInt(-rc,rc), 0, COLS-1);
      const r = clamp(origin.r + rndInt(-rr,rr), 0, ROWS-1);
      if(!okAt(c,r)) continue;
      return {c,r};
    }
  }
  /* 实在找不到：从口心向外一圈一圈找最近的可站格 */
  for(let rad=1; rad<=6; rad++){
    for(let dr=-rad; dr<=rad; dr++){
      for(let dc=-rad; dc<=rad; dc++){
        if(Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
        const c = clamp(origin.c+dc, 0, COLS-1), r = clamp(origin.r+dr, 0, ROWS-1);
        if(okAt(c,r)) return {c,r};
      }
    }
  }
  return {c:origin.c, r:origin.r};
}

/* 在基地附近找一个空格（事件奖励用）
   以基地为中心的 5×5 范围（= 召唤范围）：第五关基地在环心，
   这样白送的援军才会落在环内，而不是落到环外岩壁里去。 */
function spawnNearBase(){
  for(let i=0;i<160;i++){
    const c=clamp(rndInt(BASE_TILE.c-2,BASE_TILE.c+2),0,COLS-1);
    const r=clamp(rndInt(BASE_TILE.r-2,BASE_TILE.r+2),0,ROWS-1);
    if(!passable(c,r)) continue;
    if(occupiedAt(c,r)) continue;
    if(c===BASE_TILE.c&&r===BASE_TILE.r) continue;
    if(isMineTile(c,r)) continue;
    return {c,r};
  }
  return {c:clamp(BASE_TILE.c+2,0,COLS-1), r:BASE_TILE.r};
}

/* 兼容旧调用名（测试中可能引用） */
function spawnRandomTile(ally){ return ally ? spawnNearBase() : spawnLaneTile('lower'); }

/* 该格是否被占用。
   exemptMinerStack=true 时：矿场格允许"多矿工叠加"——
   多个矿工可以同时站在同一个矿场格上（产金依旧按矿工线性叠加）。
   仅对矿工生效：敌人 / 其他兵种仍视为已占用，不会被当作可落点。 */
function occupiedAt(c,r, exemptMinerStack, opts){
  const onMine = isMineTile(c,r);
  const ignoreFlying = !!(opts && opts.ignoreFlying);
  for(const u of G.units){
    if(!u.alive || u.c!==c || u.r!==r) continue;
    /* 飞行单位（魔龙 / 飞行怪）在空中，不占用地面格：
       否则魔龙贴上来时，玩家连往它脚下那一格撤兵都会被拒 */
    if(ignoreFlying && u.flying) continue;
    if(exemptMinerStack && onMine && u.side==='player' && u.typeId==='miner') continue;
    return true;
  }
  if(G.base.alive && G.base.c===c && G.base.r===r) return true;
  return false;
}

/* ============================================================
   8. 玩家操作
   ------------------------------------------------------------
   - 召唤 (pendingSummon)
   - 选中士兵 / 下达移动命令
   - 升级卡牌
   - 结束回合
   ============================================================ */

/* 该卡本回合剩余可召唤次数 */
function summonLeft(card){
  return SUMMON_PER_TURN - (card.summonCountThisTurn || 0);
}

/* 点击召唤：进入选点模式 */
function beginSummon(cardId){
  const card = G.cards[cardId];
  if(!card) return;
  if(summonLeft(card) <= 0){ toast(`本回合【${BASE[cardId].name}】已召唤 ${SUMMON_PER_TURN} 次`); return; }
  const apCost = BASE[cardId].cost || 1;      // 守卫者这类精英兵 cost 为 2
  if(G.ap < apCost){ toast(`行动值不足（${BASE[cardId].name}需要 ${apCost} 点）`); return; }
  if(G.turnPhase!=='action'){ toast('请等待事件结束'); return; }
  /* 场上数量上限：同兵种存活单位数不能超过 UNIT_CAPS */
  const cap = unitCap(cardId), cur = unitCount(cardId);
  if(cur >= cap){
    toast(`【${BASE[cardId].name}】场上已达上限（${cur}/${cap}），需先折损才能增援`);
    return;
  }
  G.pendingSummon = { cardId };
  G.selectedUnit = null;
  closeRewardModal();
  sfx('summon');                     // 召唤起手音
  logLine(`准备召唤【${BASE[cardId].name}】，请点击基地门口的格子放置（场上 ${cur}/${cap}）`, 'info');
  updateUI();
}

function tryPlaceSummon(c,r){
  if(!G.pendingSummon) return;
  const around = [];
  for(let dc=-2;dc<=2;dc++)for(let dr=-2;dr<=2;dr++){
    const nc=BASE_TILE.c+dc, nr=BASE_TILE.r+dr;
    if(!passable(nc,nr)) continue;
    around.push({c:nc,r:nr,d:Math.hypot(dc,dr)});
  }
  const hit = around.find(a=>a.c===c&&a.r===r);
  if(!hit){ toast('请选择基地门口附近的格子'); return; }
  if(occupiedAt(c,r)){ toast('该格已被占用'); return; }

  const cardId = G.pendingSummon.cardId;
  const apCost = BASE[cardId].cost || 1;
  if(G.ap < apCost){ toast(`行动值不足（需要 ${apCost} 点）`); return; }

  const u = makeUnit(cardId,'player',{c,r});
  const card = G.cards[cardId];
  if(summonLeft(card) <= 0){ toast(`本回合【${BASE[cardId].name}】已召唤 ${SUMMON_PER_TURN} 次`); G.pendingSummon=null; updateUI(); return; }
  u.lv = card.lv;
  applyLevel(u);
  G.units.push(u);

  // 矿工自动驻守矿场？—— 需玩家命令前往矿场
  G.ap -= apCost;
  card.summonCountThisTurn = (card.summonCountThisTurn || 0) + 1;
  G.pendingSummon = null;

  const left = summonLeft(card);
  sfx('place');                      // 落地音
  showFloat(u.x,u.y-10, `-${apCost} ⚡`, '#4dd0ff');
  logLine(`召唤了【${BASE[cardId].name}】(-${apCost} 行动值)${left>0 ? `，本回合还可召唤 ${left} 次` : '，本回合该卡已用完'}`, 'info');
  updateUI();
}

/* 是否允许玩家指挥部队（选中 / 下令移动）。移动不消耗行动值：
   · 行动阶段：正常布阵；
   · 敌方阶段：战场仍在实时推进（敌人进攻、魔龙放定点轰炸），此时必须
     保留指挥权 —— 轰炸提前 3 秒画预警圈，玩家要把圈里的士兵撤走，
     否则技能提示就成了空话。这是"魔龙回合点不动士兵"那个 bug 的修复点。
   事件阶段（选事件 / 出怪结算）仍然禁止指挥 —— 该阶段是纯结算演出，
   规则保持原样；确认阶段可指挥与否一律走 canCommandUnit()。 */
function canCommandUnit(){
  if(!G || G.phase!=='playing') return false;
  if(G.choiceOpen) return false;               // 模态弹窗打开 → 战场暂停，不可指挥
  return G.turnPhase==='action' || G.turnPhase==='enemy';
}

/* 不能指挥时的提示：事件阶段单独说明，避免和"卡住"混淆 */
function blockCommandToast(){
  if(G && G.turnPhase==='event') toast('事件结算中，稍候即可指挥');
  else toast('请等待事件结束');
}

/* 点击己方士兵 → 选中 */
function selectUnit(u){
  if(!canCommandUnit()){ blockCommandToast(); return; }
  if(u.side!=='player' || u.isBase){ return; }
  G.selectedUnit = u.uid;
  sfx('select');
  logLine(`选中【${u.name}】，点击地图格下达移动命令`, 'info');
  updateUI();
}

/* 命令选中单位前往某格（移动不消耗行动值）
   矿工前往矿场时豁免"占位"检查 → 允许多个矿工叠在同一个矿场格上 */
function commandMove(u, c, r){
  if(!canCommandUnit()){ blockCommandToast(); return; }
  const goingToMine = (u.typeId==='miner' && isMineTile(c,r));
  /* 目标格判定忽略飞行单位：它们浮在空中，不该挡住地面士兵的落点 */
  if(occupiedAt(c,r, goingToMine, { ignoreFlying:true })){
    toast('目标格已被占用'); return;
  }
  const path = aStar({c:u.c,r:u.r},{c,r});
  if(!path || path.length<2){ toast('无法到达该位置'); return; }

  u.path = path.slice(1);   // 去掉起点
  u.pathIdx = 0;
  u.moving = true;
  u.autoMove = false;
  u.manualOrder = true;     // 玩家命令优先，取消自动前压
  u.target = null;
  u.homeTile = {c,r};
  u.deployed = true;        // 玩家下达过移动命令 → 解除"原地不动"限制

  // 矿工被命令前往矿场 → 抵达后开始产金币
  if(goingToMine){
    logLine('矿工前往矿场，抵达后每回合产出 10 金币（矿场 4 格，可多矿工叠加开采）', 'gold');
  }

  G.selectedUnit = null;
  sfx('move');
  logLine(`命令【${u.name}】前往 (${c},${r})`, 'info');
  updateUI();
}

/* ============================================================
   8b. 商店系统
   ------------------------------------------------------------
   - 常驻面板，货架 3 格
   - 购买：扣金币 → 加卡/应用升级（不消耗行动值）
   - 刷新：1 行动值 + 5 金币，每回合上限 2 次
   - 商品池：未拥有的新卡 + 对应兵种在手牌的下一级升级卡 + 补给
   ============================================================ */

/* 新卡定义（商店可购买解锁） */
const SHOP_NEW_CARDS = [
  { id:'shield', name:'盾卫',   emoji:'🛡️', price:PRICE_NEW_CARD },
  { id:'gunner', name:'枪炮手', emoji:'🔫', price:PRICE_NEW_CARD },
  { id:'holyblade', name:'圣剑士', emoji:'⚔️', price:PRICE_NEW_CARD, levels:[4,5] },  // 第四、第五关可选
  /* 第五关专属：守卫者（75 金 · 召唤耗 2 行动值 · 场上限 1 · 等级恒 1）
     和另外三个商店兵种一样参加出征选卡：第五关 4 选 2（圣剑士 / 枪炮手 / 守卫者 / 盾卫），
     选中了本关商店才进货。 */
  { id:'guardian', name:'守卫者', emoji:'🗿', price:75, levels:[5] },
];

/* 各兵种的升级卡（按等级） */
const SHOP_UPGRADES = [
  { typeId:'swordsman', lv:2, name:'剑士·盾墙',  price:PRICE_LV2 },
  { typeId:'swordsman', lv:3, name:'剑士·反击',  price:PRICE_LV3 },
  { typeId:'archer',    lv:2, name:'弓箭手·连射', price:PRICE_LV2 },
  { typeId:'archer',    lv:3, name:'弓箭手·穿透', price:PRICE_LV3 },
  { typeId:'miner',     lv:2, name:'矿工·勘探',  price:PRICE_LV2 },
  { typeId:'miner',     lv:3, name:'矿工·自动化', price:PRICE_LV3 },
  { typeId:'shield',    lv:2, name:'盾卫·铁壁',  price:PRICE_LV2 },
  { typeId:'shield',    lv:3, name:'盾卫·羁绊',  price:PRICE_LV3 },
  { typeId:'gunner',    lv:2, name:'枪炮手·爆破', price:PRICE_LV2 },
  { typeId:'gunner',    lv:3, name:'枪炮手·震撼', price:PRICE_LV3 },
  { typeId:'holyblade', lv:2, name:'圣剑士·圣光斩', price:PRICE_LV2 },
  { typeId:'holyblade', lv:3, name:'圣剑士·不屈',   price:PRICE_LV3 },
];

/* 消耗品 */
const SHOP_SUPPLIES = [
  { id:'medkit',  name:'急救包', emoji:'💊', price:15 },
  { id:'wage',    name:'军饷',   emoji:'💰', price:40 },
];

/* 构造当前可用商品池（不含已购/已满级）
   —— 关卡可关闭"新兵种"售卖：cfg.shopCards === false 时只卖
      升级卡与补给（第一关就是这种模式，保持兵种不变）。 */
function buildShopPool(){
  const pool = [];
  const allowNewCards = !G.lv || G.lv.shopCards !== false;
  if(allowNewCards){
    const draftOn = !!(G.lv && G.lv.id >= DRAFT_FROM_LEVEL);
    const picks = (G && G.draftPicks) || [];
    for(const nc of SHOP_NEW_CARDS){
      if(nc.levels && G.lv && !nc.levels.includes(G.lv.id)) continue;   // 限定关卡的新卡
      /* 选卡关：只有出征时选中的兵种才会出现在本关商店
         （关卡配置里给某张卡写 noDraft:true 可让它恒定上架，目前没有这种卡） */
      if(draftOn && !nc.noDraft && !picks.includes(nc.id)) continue;
      if(!G.cards[nc.id]) pool.push({ kind:'card', ...nc });
    }
  }
  for(const up of SHOP_UPGRADES){
    const card = G.cards[up.typeId];
    if(!card) continue;                 // 没有该兵种 → 不卖其升级卡
    if(card.lv === up.lv - 1) pool.push({ kind:'upgrade', ...up });  // 只卖"下一级"
  }
  for(const sp of SHOP_SUPPLIES) pool.push({ kind:'supply', ...sp });
  return pool;
}

/* 刷新货架。free=true 时不扣费（进入行动阶段的自动补货） */
function refreshShop(cost, free){
  if(!G || G.phase!=='playing') return false;
  if(!G.lv.hasShop) return false;          // 未开放商店的关卡（第一关/第二关都已开放）
  if(!free){
    if(G.turnPhase!=='action'){ toast('当前阶段无法刷新'); return false; }
    if(G.shop.refreshLeft <= 0){ toast('本回合刷新次数已用完'); return false; }
    if(G.ap < REFRESH_AP){ toast('行动值不足，无法刷新'); return false; }
    if(G.gold < REFRESH_GOLD){ toast('金币不足，无法刷新'); return false; }
    G.ap -= REFRESH_AP;
    G.gold -= REFRESH_GOLD;
    G.shop.refreshLeft -= 1;
  }
  const pool = buildShopPool();
  const picked = [];
  /* 出征时选中的新兵种优先上架：选卡本来就是"给本关商店进货"，
     不该出现"选了圣剑士，刷十次货架都见不到"的情况。最多先占 2 格，
     剩下至少留 1 格给升级卡与补给，货架不至于全是新兵种。 */
  const wish = (G.draftPicks || []);
  for(let i=pool.length-1; i>=0; i--){
    const it = pool[i];
    if(it.kind==='card' && wish.includes(it.id) && picked.length < SHOP_SLOTS-1){
      picked.push(it);
      pool.splice(i,1);
    }
  }
  while(picked.length < SHOP_SLOTS && pool.length){
    const k = rndInt(0, pool.length-1);
    picked.push(pool.splice(k,1)[0]);
  }
  G.shop.slots = picked;
  if(!free){
    logLine(`刷新货架 (-${REFRESH_AP}行动值, -${REFRESH_GOLD}金币)`, 'info');
  }
  updateUI();
  return true;
}

/* 购买货架第 i 格的商品 */
function buyShopItem(i){
  if(!G || G.phase!=='playing') return;
  if(!G.lv.hasShop){ toast('本关未开放商店'); return; }
  /* 双保险：极少数情况下货架仍残留"解锁新兵种"（例如中途切关），
     而此时该关已关闭新卡售卖 → 拒绝购买，避免绕过 shopCards 限制。 */
  const it = G.shop.slots[i];
  if(it && it.kind==='card' && G.lv.shopCards===false){
    toast('本关商店不出售新兵种'); return;
  }
  if(G.turnPhase!=='action'){ toast('当前阶段无法购买'); return; }
  if(!it){ toast('该格没有商品'); return; }
  if(G.gold < it.price){ toast(`金币不足（需要 ${it.price}）`); return; }

  if(it.kind==='card'){
    G.gold -= it.price;
    G.cards[it.id] = { lv:1, summonCountThisTurn:0 };
    codexMark('player', it.id);
    if(!CARD_ORDER.includes(it.id)) CARD_ORDER.push(it.id);
    showBanner(`解锁新卡：【${it.name}】`, 'pos');
    logLine(`购买新卡【${it.name}】(-${it.price}金币)`, 'gold');
  }
  else if(it.kind==='upgrade'){
    const card = G.cards[it.typeId];
    if(!card || card.lv !== it.lv-1){ toast('该升级卡已不可用'); return; }
    G.gold -= it.price;
    card.lv = it.lv;
    syncFieldUnits(it.typeId, it.lv);
    showBanner(`升级成功：【${BASE[it.typeId].name}】Lv.${it.lv}`, 'pos');
    logLine(`购买升级卡【${it.name}】(-${it.price}金币) → ${BASE[it.typeId].name} Lv.${it.lv}`, 'gold');
  }
  else if(it.kind==='supply'){
    if(it.id==='medkit'){
      /* 急救包：场上所有己方士兵血量回满（基地与矿工不在范围内） */
      const wounded = G.units.filter(u => u.alive && u.side==='player' && u.kind!=='none' && u.hp < u.hpMax);
      if(!wounded.length){ toast('场上没有需要治疗的士兵'); return; }
      G.gold -= it.price;
      for(const u of wounded){
        u.hp = u.hpMax;
        u.graceUntil = 0;          // 被救回来的话，取消「不屈」倒计时
        showFloat(u.x, u.y-24, '回满', '#5ddc7a');
      }
      showBanner(`急救包：${wounded.length} 名士兵血量回满`, 'pos');
      logLine(`使用【急救包】${wounded.length} 名士兵血量回满 (-${it.price}金币)`, 'gold');
    } else {
      G.gold -= it.price;
      G.ap += 3;   // 与事件「战前动员」一致：允许临时突破上限（apMax 本身不变）
      logLine(`使用【军饷】+3 行动值（可突破上限，当前 ${G.ap}） (-${it.price}金币)`, 'gold');
    }
  }

  /* 购买后该格清空 */
  G.shop.slots.splice(i,1);
  sfx(it.kind==='upgrade' ? 'upgrade' : 'buy');   // 升级卡用更"亮"的三音上行
  updateUI();
}

/* 兼容旧名：升级卡牌（现由商店内部调用；不消耗行动值） */
function upgradeCard(cardId){
  const card = G.cards[cardId];
  if(!card) return;
  if(card.lv>=3){ toast('已达最高等级'); return; }
  /* 旧的直接升级入口已废弃，改由商店购买升级卡 */
  toast('请前往商店购买升级卡');
}

/* ------------------------------------------------------------
   回合结束结算：所有"产出"统一在这里入账
   ------------------------------------------------------------
   结算时点约定：
     · 回合【结束】时 → 结算一切产出（低保 + 矿工产金），下一回合即可使用
     · 回合【开始】时 → 只重置行动值与刷新次数，不再发放金币
   收入已改为固定低保，取消击杀掉金。
   ------------------------------------------------------------ */
function settleIncome(){
  const gains = [];      // {text, gold, tile}

  /* 1) 每回合低保（第一关为 0，不发放） */
  const floor = G.lv.floorGold || 0;
  if(floor>0){
    gains.push({ text:`回合低保：+${floor} 金币`, gold:floor, tile:BASE_TILE });
  }

  /* 2) 矿工产金：站在矿场 4 格内任一格的矿工都产金，线性叠加（每格独立）。
        Lv3 自动化：不在矿场也能额外 +5。 */
  let mined = 0;
  let minersAtMine = 0;
  for(const u of G.units){
    if(u.side==='player' && u.typeId==='miner' && u.alive){
      let per = MINE_GOLD;
      if(u.pas && u.pas.prospect) per += 5;            // 勘探：+5/回合
      const atMine = isMineTile(u.c, u.r);
      if(atMine){ mined += per; minersAtMine++; }
      else if(u.pas && u.pas.automation){ mined += 5; } // 自动化：随处额外 +5
    }
  }
  if(mined>0){
    const extra = minersAtMine>0 ? `（${minersAtMine} 名矿工在矿场）` : '';
    gains.push({ text:`矿工产出：+${mined} 金币${extra}`, gold:mined, tile:mineCenterTile() });
  }

  /* 汇总入账 */
  let total = 0;
  for(const g of gains){
    total += g.gold;
    logLine(g.text, 'gold');
    const ctr = tileCenter(g.tile.c, g.tile.r);
    showFloat(ctr.x, ctr.y, `+${g.gold} ◈`, '#ffcf4d');
  }
  if(total>0){ G.gold += total; sfx('coin'); }   // 金币入账提示音

  return total;
}

/* 结束回合 */
function endTurn(){
  if(G.turnPhase!=='action'){ toast('当前阶段无法结束回合'); return; }
  if(G.phase!=='playing') return;
  sfx('turn');                  // 结束回合号角
  saveGame();   // 行动阶段末快照（含本回合召唤/购物）

  /* ---- 1. 回合结束结算：产出统一入账，下一回合即可使用 ---- */
  const income = settleIncome();
  if(income>0){
    showBanner(`回合结算：+${income} 金币`, 'gold');
  }

  /* ---- 2. 出怪阶段：本回合的敌人现在才出现（玩家已排完阵） ---- */
  if(G.pendingSpawns && G.pendingSpawns.length){
    G.turnPhase = 'event';
    G.spawnAfterAction = true;           // 队列走完后接敌方阶段
    G.triggerQueue = G.pendingSpawns;
    G.pendingSpawns = [];
    updateUI();
    processNextEvent();                  // 事件机制自带 900ms 间隔，出怪逐批冒出
    return;                              // 敌方阶段由 processNextEvent → beginEnemyPhase 接管
  }

  beginEnemyPhase();
}

/* 出怪结束 → 敌方阶段 → 胜负判定 / 下一回合 */
function beginEnemyPhase(){
  if(G.phase!=='playing') return;
  G.turnPhase = 'enemy';
  updateUI();
  setTimeout(()=>{
    if(G.phase!=='playing') return;
    /* 若正在播放精英/BOSS 登场介绍，把回合推进推迟到演出结束之后，
       否则演出会被下一个回合的事件弹窗盖掉。 */
    afterIntro(()=>{
      if(G.phase!=='playing') return;
      // 敌方回合在 update 循环中已经实时进行，这里只做阶段切换
      if(G.round >= G.lv.rounds){
        /* 最后一波：必须等场上敌人全部清空才判胜（否则怪还没走到就被判赢了）。
           还有敌人 → 留在敌方阶段，由 update() 轮询清场后判胜。 */
        if(!G.units.some(u => u.side==='enemy' && u.alive) && !kingPending()){ endGame('win'); }
      } else {
        startRound(G.round+1);
      }
    });
  }, 700);
}

/* ============================================================
   9. 战斗 & 实时更新
   ============================================================ */
function damageBase(d, reason){
  if(!G || G.phase!=='playing') return;
  sfx('baseHit');                    // 基地受创：低沉闷响
  G.baseHp = Math.max(0, G.baseHp - d);
  G.base.hp = G.baseHp;
  showFloat(G.base.x, G.base.y-20, `-${d}`, '#ff4d6d');
  logLine(`${reason}：基地 -${d} 生命`, 'neg');
  if(G.baseHp<=0) endGame('lose');
  updateUI();
}

/* 单位受伤（含地形/被动减伤、羁绊转移）
   opts: { melee:bool(是否近战伤害), attacker:unit } */
function damageUnit(u, d, by, opts){
  if(!u || !u.alive) return;
  opts = opts || {};
  let dmg = d;

  /* ---- 地形：树林减远程伤害（守方所在格） ---- */
  if(opts.ranged && !u.flying){
    const terr = terrainAt(u.c, u.r);
    if(terr && terr.rangedReduce) dmg *= (1 - terr.rangedReduce);
  }
  /* ---- 被动：持盾（远程伤害减免，骷髅 30% / 持盾骷髅 50%） ---- */
  if(opts.ranged && u.rangedResist) dmg *= (1 - u.rangedResist);
  /* ---- 被动：盾墙（近战受伤 -25%） ---- */
  if(opts.melee && u.pas && u.pas.shieldwall) dmg *= 0.75;
  /* ---- 被动：铁壁（所有伤害 -20%） ---- */
  if(u.pas && u.pas.bulwark) dmg *= 0.80;
  /* ---- 守卫者：石躯，自身受到的所有伤害 -20% ---- */
  if(u.dmgReduce) dmg *= (1 - u.dmgReduce);
  /* ---- 被动：羁绊（周围 2 格友军受伤 30% 转移给自己） ---- */
  if(u.side==='player'){
    const bond = G.units.find(a=>a.alive && a.side==='player' && a.pas && a.pas.bond
      && a.uid!==u.uid && tileDist(a, u) <= 2);
    if(bond){
      const transfer = dmg*0.30;
      rawDamage(bond, transfer);   // 直接扣血，不再触发二次转移
      dmg -= transfer;
    }
  }

  const wasAlive = u.alive;
  rawDamage(u, dmg);

  /* ---- 持盾骷髅：击杀士兵 → 把它变成骷髅（基地/矿工不算） ---- */
  if(wasAlive && !u.alive && by && by.raiseFallen
     && u.side === 'player' && !u.isBase && u.kind !== 'none'){
    raiseSkeleton(u);
  }

  /* 记录受伤时刻（用于脱战判定） */
  u.lastHurtAt = gameTime;

  /* 萨满：自身受到伤害时，给周围敌人 +15% 攻击力（3 秒） */
  if(u.shaman){
    for(const e of G.units){
      if(e.side==='enemy' && e.alive) e.atkBuffTimer = Math.max(e.atkBuffTimer||0, 3);
    }
  }

  /* ---- 被动：反击（被近战击中 → 反弹 40% 给攻击者） ---- */
  if(opts.melee && u.pas && u.pas.counter && by && by.alive && !by.isBase){
    const back = dmg*0.40;
    if(back>0) rawDamage(by, back);
  }
}

/* 纯扣血（不触发减伤/反击，供羁绊转移等内部使用） */
function rawDamage(u, d){
  if(!u || !u.alive || d<=0) return;
  u.hp = Math.max(0, u.hp - d);
  showFloat(u.x, u.y-14, `-${(+d.toFixed(1))}`, u.side==='player'?'#ff9a3c':'#ffffff');
  if(u.hp<=0){
    /* 「不屈」生效期间：血锁在 0，怎么打都不倒 —— 到点由主循环判死 */
    if(u.graceUntil && gameTime < u.graceUntil){
      u.hp = 0;
      sfx('hit');
      return;
    }
    /* Lv3「不屈」：玩家单位生命归零后仍可战斗 4 秒（每场一次） */
    if(u.side==='player' && u.pas && u.pas.lastStand && !u.graceUsed){
      u.graceUsed = true;
      u.graceUntil = gameTime + 4;
      u.hp = 0;
      showFloat(u.x, u.y-30, '不屈 4秒!', '#ffe089');
      logLine(`【${u.name}】不屈：生命归零，仍可战斗 4 秒`, 'pos');
      return;
    }
    u.alive=false;
    if(u.uid===G.selectedUnit) G.selectedUnit=null;
    if(u.isBase){ return; }
    sfx('death');                    // 倒地
    logLine(`${u.side==='enemy'?'敌方':''}【${u.name}】被击倒`, u.side==='enemy'?'pos':'neg');
    /* 守卫者：石像崩解 → 炸出金色冲击波（只伤敌人，不伤基地与友军） */
    if(u.side==='player' && u.deathBomb) guardianDetonate(u);
    /* 骷髅王体系：容器（持盾骷髅）倒下 → 破体动画；本体倒下 → 再拉 2 个骷髅陪葬 */
    if(u.side==='enemy'){
      if(u.vessel) startKingBurst(u);
      if(u.deathSummon){
        const ms = summonMinionsAround(u, u.deathSummon.typeId, u.deathSummon.count);
        if(ms.length){
          showFloat(u.x, u.y-34, '亡者不息!', '#c9a6ff');
          logLine(`【${u.name}】倒下时又召唤出 ${ms.length} 个骷髅`, 'neg');
        }
      }
    }
  } else {
    sfx('hit');                      // 命中（自带节流，不会糊成一片）
  }
}

/* 找最近可攻击目标
   规则优先级：
     · 玩家单位：只找敌方；但【飞行怪】只能被远程单位选中
     · 敌人：【只打基地】的怪（攻城槌/狼骑）只锁定基地
             【矿场破坏者】—— 全队唯一会扑矿场的怪：优先杀矿工，其次驻守矿场格
             其余敌人（小怪/萨满/飞行怪/攻城槌/狼骑/BOSS）：
               一律优先打【最近的玩家单位】，其次才是基地。
               它们【不会】被矿场吸引，也不会特意绕路去杀矿工。
             【嘲讽】半径内有盾卫 → 优先攻击盾卫
   ------------------------------------------------------------ */
function findTarget(u){
  /* ---- 玩家寻敌 ---- */
  if(u.side==='player'){
    let best=null, bd=Infinity;
    for(const e of G.units){
      if(e.side!=='enemy' || !e.alive) continue;
      if(e.rangedOnly && u.kind!=='ranged') continue;   // 飞行怪：近战无法选中
      const d = Math.hypot(e.x-u.x, e.y-u.y);
      if(d<bd){ bd=d; best=e; }
    }
    return { target:best, dist:bd };
  }

  /* ---- 敌人选目标 ---- */
  /* 只打基地的怪（攻城槌 / 狼骑）：无视一切玩家单位与矿场 */
  if(u.baseOnly){
    return { target: G.baseHp>0 ? G.base : null, dist: G.baseHp>0 ? Math.hypot(G.base.x-u.x, G.base.y-u.y) : Infinity };
  }
  /* 矿场破坏者：全队唯一会"主动扑矿场"的单位 */
  if(u.antiMine){
    let best=null, bd=Infinity;
    for(const p of G.units){
      if(p.side!=='player' || !p.alive || p.typeId!=='miner') continue;
      const d = Math.hypot(p.x-u.x, p.y-u.y);
      if(d<bd){ bd=d; best=p; }
    }
    if(best) return { target:best, dist:bd };
    /* 没有矿工可杀 → 驻守矿场（不会去打基地）。
       目标点取整块 2×2 的中心，破坏者会停在矿场里而不是某一角。 */
    const mc = mineCenterPx();
    return { target:{ c:MINE_TILE.c, r:MINE_TILE.r, mine:true, x:mc.x, y:mc.y, isMineTile:true,
                      alive:true, side:'player', name:'矿场' },
             dist: Math.hypot(mc.x-u.x, mc.y-u.y) };
  }

  /* 嘲讽：半径内盾卫优先 */
  let taunter=null, td=Infinity;
  for(const p of G.units){
    if(p.side!=='player' || !p.alive || !p.taunt) continue;
    const d = Math.hypot(p.x-u.x, p.y-u.y);
    if(d <= pxDistTiles(p.taunt) && d<td){ td=d; taunter=p; }
  }
  if(taunter) return { target:taunter, dist:td };

  /* 默认：最近玩家单位 → 基地（矿工也是合法目标，但不会为它绕路） */
  let best=null, bd=Infinity;
  for(const p of G.units){
    if(p.side!=='player' || !p.alive) continue;
    const d = Math.hypot(p.x-u.x, p.y-u.y);
    if(d<bd){ bd=d; best=p; }
  }
  if(G.baseHp>0){
    const d = Math.hypot(G.base.x-u.x, G.base.y-u.y);
    if(d<bd){ bd=d; best=G.base; }
  }
  return { target:best, dist:bd };
}

function inRange(u, t){
  return Math.hypot(t.x-u.x, t.y-u.y) <= pxDistTiles(u.range) + 4;
}

/* 目标格被占用（含基地格）时，找其最近的可站立方格 */
function nearestFreeTile(center){
  if(!occupiedAt(center.c, center.r)) return {c:center.c, r:center.r};
  const cands = [];
  for(let dc=-3; dc<=3; dc++) for(let dr=-3; dr<=3; dr++){
    const c = center.c+dc, r = center.r+dr;
    if(c<0||r<0||c>=COLS||r>=ROWS) continue;
    if(occupiedAt(c,r)) continue;
    if(c===center.c && r===center.r) continue;
    cands.push({c, r, d: Math.hypot(dc,dr)});
  }
  if(!cands.length) return null;
  cands.sort((a,b)=>a.d-b.d);
  return {c:cands[0].c, r:cands[0].r};
}

/* 移动单位沿路径 */
function moveAlongPath(u, dt){
  /* 眩晕：站在原地不动 */
  if(isStunned(u)) return;
  if(!u.path || u.pathIdx>=u.path.length){ u.moving=false; return; }
  const node = u.path[u.pathIdx];
  const tp = tileCenter(node.c, node.r);
  const dx = tp.x-u.x, dy = tp.y-u.y;
  const d = Math.hypot(dx,dy);

  /* 移速 0 的单位（矿工）不会自行移动；但玩家下达移动命令后可按"部署速度"到位 */
  const baseSpd = u.moveSpeed>0 ? u.moveSpeed : (u.deployed ? 0.75 : 0);
  if(baseSpd<=0){ u.moving=false; u.path=null; return; }
  /* 地形：沼泽减速（飞行/矿工部署不受影响） */
  let terrMul = 1;
  if(!u.flying){
    const terr = terrainAt(node.c, node.r);
    if(terr && terr.speedMul) terrMul *= terr.speedMul;
  }
  /* 震撼：被命中的敌人减速 */
  let slowMul = 1;
  if(u.slowUntil && gameTime < u.slowUntil) slowMul = u.slowMul || 0.7;
  /* 敌军狂暴事件：本回合敌方移速倍率（只作用于敌人） */
  let evtMul = 1;
  if(u.side==='enemy' && G.enemySpeedMul && G.enemySpeedMul!==1) evtMul = G.enemySpeedMul;
  const step = baseSpd * terrMul * slowMul * evtMul * TILE * dt;   // 格/秒 → 像素/秒

  if(d <= step){
    u.x=tp.x; u.y=tp.y; u.c=node.c; u.r=node.r;
    u.pathIdx++;
    if(u.pathIdx>=u.path.length){
      u.moving=false; u.path=null;
      u.deployed=false;          // 到位后恢复静止
      u.homeTile={c:u.c,r:u.r};
      // 矿工抵达矿场提示（矿场 4 格内任一格都算就位）
      if(u.typeId==='miner' && isMineTile(u.c, u.r)){
        const per = MINE_GOLD + (u.pas&&u.pas.prospect ? 5 : 0);
        showFloat(u.x, u.y-24, `开采中 +${per}◈`, '#ffcf4d');
        logLine(`矿工已就位，每回合产出 ${per} 金币`, 'gold');
      }
    }
  } else {
    u.x += dx/d*step;
    u.y += dy/d*step;
    const tt = pxToTile(u.x,u.y);
    u.c=tt.c; u.r=tt.r;
  }
}

/* 主更新循环 */
let lastT = 0;
let gameTime = 0;             // 全局游戏时间（秒），用于脱战/光环计时
/* 判断是否处于"菜单界面"（标题 / 选关 / 简报）—— 此时冻结战场 */
function inMenuScreen(){
  if(typeof document==='undefined') return false;
  const ids = ['title-screen','level-select','briefing'];
  for(const id of ids){
    const el = document.getElementById(id);
    if(el && !el.classList.contains('hidden')) return true;
  }
  return false;
}

function update(dt){
  if(!G || G.phase!=='playing') return;
  // 菜单界面打开时暂停战场推进
  if(inMenuScreen()) return;
  /* 精英 / BOSS 登场演出：世界定格，敌人原地待命，
     让玩家看清楚"来了什么"再开打（演出结束自动恢复）。
     演出倒计时必须排在模态守卫【之前】：两者万一同时成立，
     若先被模态挡住，tickIntro 永远不跑 → 演出定格无法解除，游戏假死。 */
  if(G.introFreeze > 0){ tickIntro(dt); return; }
  /* 事件选择模态（二选一 / 选士兵）打开时冻结战场，选完立即恢复 */
  if(G.choiceOpen) return;
  gameTime += dt;

  /* 骷髅王破体动画：动画走完才真正生成 BOSS（动画期间不冻结战场） */
  tickKingBurst(dt);

  /* 最后一波清场判定：撑满回合数、处于敌方阶段且场上无存活敌人 → 胜利
     （beginEnemyPhase 发现有敌人残留时留在敌方阶段，由这里轮询判胜）
     kingPending()：骷髅王还没登场（容器活着 / 破体动画在播）时不判胜，
     否则第七波唯一的持盾骷髅一倒下就直接跳胜利，BOSS 根本没机会出场。 */
  if(G.turnPhase==='enemy' && G.round >= G.lv.rounds
     && !G.units.some(u => u.side==='enemy' && u.alive)
     && !kingPending()){
    endGame('win');
    return;
  }

  for(const u of G.units){
    if(!u.alive) continue;
    /* 「不屈」到点 → 真正倒下 */
    if(u.graceUntil && gameTime >= u.graceUntil){
      u.graceUntil = 0;
      u.alive = false;
      if(u.uid===G.selectedUnit) G.selectedUnit = null;
      sfx('death');
      logLine(`【${u.name}】不屈结束，倒地`, 'neg');
      continue;
    }

    /* ---- 敌方 AI ---- */
    if(u.side==='enemy'){
      const {target, dist:td} = findTarget(u);

      /* 统御光环 / 萨满加攻：计算本单位的攻击力倍率 */
      let dmgMul = 1;
      for(const e of G.units){
        if(e.side!=='enemy' || !e.alive || e.uid===u.uid) continue;
        if(e.aura) dmgMul *= (1+e.aura);
        if(e.shaman && e.atkBuffTimer>0) dmgMul *= 1.15;
      }
      const outDmg = u.dmg * dmgMul * atkDmgMul(u);

      /* 萨满：周期性为周围敌人回血 + 自身受击给周围敌人加攻 */
      if(u.shaman){
        u.healCd -= dt;
        if(u.healCd<=0){
          u.healCd = 3;
          let healed=0;
          for(const e of G.units){
            if(e.side!=='enemy' || !e.alive || e.uid===u.uid) continue;
            if(tileDist(e,u) <= 3 && e.hp < e.hpMax){ e.hp = Math.min(e.hpMax, e.hp+8); healed++; }
          }
          if(healed) showFloat(u.x, u.y-26, `+8×${healed}`, '#5ddc7a');
        }
      }
      if(u.atkBuffTimer>0) u.atkBuffTimer -= dt;

      /* BOSS 践踏：每 10 秒对半径 2 格玩家单位造成伤害（stompDmg 可配，攻城领主 8） */
      if(u.stomp){
        u.stompCd -= dt;
        if(u.stompCd<=0){
          u.stompCd = 10;
          const sDmg = u.stompDmg || 3;
          let hit=0;
          for(const p of G.units){
            if(p.side!=='player' || !p.alive) continue;
            if(tileDist(p,u) <= 2){ damageUnit(p, sDmg, u, {}); hit++; }
          }
          if(hit){
            showFloat(u.x, u.y-30, '践踏!', '#c06cff');
            logLine(`⚠ ${u.name} 践踏，命中 ${hit} 个我方单位`, 'neg');
            sfx('stomp');                  // 沉重的地面冲击
            u.stompAnim = 0.5;
          }
        }
      }

      /* 骷髅王：每 10 秒召唤 1 个骷髅（在自己身边找空格） */
      if(u.minion){
        u.minionCd -= dt;
        if(u.minionCd <= 0){
          u.minionCd = u.minion.every || 10;
          const ms = summonMinionsAround(u, u.minion.typeId || 'skeleton', 1);
          if(ms.length){
            showFloat(u.x, u.y-34, '召唤骷髅!', '#c9a6ff');
            logLine(`【${u.name}】召唤出 1 个骷髅`, 'neg');
            sfx('elite');
          }
        }
      }

      /* 毁灭魔龙「定点轰炸」：随机选取一个【我方单位】，
         在其位置半径 2 格放置预警圈，3 秒后爆炸（20 伤），冷却 10 秒。
         基地不在候选里 —— 轰炸伤不到基地，选中基地等于空放技能。 */
      if(u.bombRaid){
        u.bombCd -= dt;
        if(u.bombCd <= 0){
          u.bombCd = u.bombCdMax;
          const cands = G.units.filter(p => p.side==='player' && p.alive);
          if(cands.length){
            const tgt = cands[rndInt(0, cands.length-1)];
            G.bombWarnings.push({
              c: tgt.c, r: tgt.r,
              timer: u.bombWarn, total: u.bombWarn,
              dmg: u.bombDmg, radius: u.bombRadius,
            });
            sfx('warn');                 // 预警双响：提醒玩家赶快撤兵
            showBanner(`⚠ ${u.name} 锁定了轰炸目标，${u.bombWarn} 秒后爆炸！`, 'neg');
            logLine(`⚠ ${u.name} 标记轰炸目标（${u.bombWarn} 秒预警，半径 ${u.bombRadius} 格）`, 'neg');
          }
        }
      }
      if(u.stompAnim>0) u.stompAnim -= dt;

      if(target){
        const reach = pxDistTiles(u.range) + 4 + (target.isBase ? TILE : 0);
        const isMine = target.isMineTile;
        if(isMine){
          /* 破坏者抵达矿场格：原地驻守等矿工（不攻击矿场本体） */
          u.moving=false; u.path=null;
        }
        else if(td <= reach){
          // 进入射程：停下攻击（眩晕期间不动作）
          u.moving=false; u.path=null;
          u.atkCd -= dt;
          if(u.atkCd<=0 && !isStunned(u)){
            u.atkCd = 1/Math.max(u.atkRate,0.001);
            if(target.isBase){
              const mul = u.baseDmgMul || 1;
              damageBase(+(outDmg*mul).toFixed(2), `${u.name}攻入基地`);
            } else {
              /* 远程敌人走弹道；近战直接结算 */
              if(u.kind==='ranged' && !target.isBase) fireProjectile(u, target, outDmg);
              else damageUnit(target, outDmg, u, { melee:true, attacker:u });
            }
            u.swing = 0.18;   // 攻击动画计时
          }
        } else {
          // 追击：定期重算路径
          u.repathCd = (u.repathCd||0) - dt;
          /* 出怪口的「进路口」：到达后清掉，恢复常规追击 */
          if(u.gate && u.c===u.gate.c && u.r===u.gate.r) u.gate = null;
          const goalTile = u.gate
            ? u.gate
            : ((target.isBase || isMine) ? nearestFreeTile({c:target.c,r:target.r}) : {c:target.c,r:target.r});
          if(!goalTile){ if(u.path) moveAlongPath(u,dt); }
          else {
            if(!u.path || u.repathCd<=0){
              const p = aStar({c:u.c,r:u.r}, goalTile);
              if(p){ u.path=p.slice(1); u.pathIdx=0; u.moving=true; }
              else if(u.gate){ u.gate = null; }   // 岔口走不通就放弃，避免原地发呆
              u.repathCd = 0.5;
            }
            if(u.path) moveAlongPath(u, dt);
          }
        }
      }
    }

    /* ---- 己方 AI ---- */
    if(u.side==='player' && u.kind!=='none'){
      const {target, dist:td} = findTarget(u);
      const inRangeNow = target && td <= pxDistTiles(u.range)+4;

      /* 玩家手动命令移动中：优先执行，期间不自动前压 */
      if(u.manualOrder && u.moving && u.path){
        moveAlongPath(u, dt);
        if(inRangeNow){
          u.atkCd -= dt;
          if(u.atkCd<=0 && !isStunned(u)){
            u.atkCd = 1/Math.max(u.atkRate,0.001);
            attack(u, target);
            u.swing = 0.18;
          }
        }
      }
      else if(inRangeNow){
        if(u.autoMove){ u.path=null; u.moving=false; u.autoMove=false; }
        u.atkCd -= dt;
        if(u.atkCd<=0 && !isStunned(u)){
          u.atkCd = 1/Math.max(u.atkRate,0.001);
          attack(u, target);
          u.swing = 0.18;
        }
      }
      else {
        u.atkCd = Math.min(u.atkCd, 1/Math.max(u.atkRate,0.001));

        /* ---------- 自动前压 / 迎击（玩家未手动指挥时生效）---------- */
        if(!u.manualOrder){
          u.returnCd -= dt;
          let goal = null, pursuing = false;
          if(target && tilesOf(td) <= ENGAGE_RANGE){
            goal = { c: target.c, r: target.r };
            pursuing = true;
          }
          else {
            const myCol = u.holdLine ? LINE_COL : (u.supportLine ? SUPPORT_COL : null);
            if(myCol!=null && u.c < myCol - LINE_TOLERANCE){
              goal = { c: myCol, r: u.homeTile ? u.homeTile.r : u.r };
            }
          }

          if(goal){
            if(u.returnCd<=0 || !u.autoMove || !u.path){
              const g = nearestFreeTile(goal);
              if(g){
                const p = aStar({c:u.c,r:u.r}, g);
                if(p && p.length>1){ u.path=p.slice(1); u.pathIdx=0; u.moving=true; u.autoMove=true; }
                else if(u.autoMove){ u.path=null; u.moving=false; u.autoMove=false; }
              }
              u.returnCd = pursuing ? 0.35 : 0.8;
            }
            if(u.path) moveAlongPath(u, dt);
          } else if(u.autoMove){
            u.path=null; u.moving=false; u.autoMove=false;
          }
        }
      }
    }

    /* ---- 矿工等无战力单位：按玩家移动命令部署 ---- */
    if(u.side==='player' && u.kind==='none'){
      if(u.path) moveAlongPath(u, dt);
    }

    if(u.swing>0) u.swing -= dt;
  }

  /* ---- 弹道 ---- */
  for(let i=PROJ.length-1;i>=0;i--){
    const p = PROJ[i];
    const t = p.target;
    if(!t || !t.alive){ PROJ.splice(i,1); continue; }
    const dx=t.x-p.x, dy=t.y-p.y, d=Math.hypot(dx,dy);
    const step = p.speed*dt;
    if(d<=step){
      if(t.isBase) damageBase(p.dmg, '远程攻击基地');
      else damageUnit(t, p.dmg, p.owner, { ranged:true, attacker:p.owner });
      /* 溅射：对目标相邻格敌人造成 50%（Lv2 爆破扩到 2 格） */
      if(p.splash && !t.isBase){
        const radius = p.splashRadius || 1;
        for(const e of G.units){
          if(e.side===p.owner.side || !e.alive || e.uid===t.uid) continue;
          if(tileDist(e, t) <= radius) rawDamage(e, p.dmg*p.splash);
        }
      }
      /* 穿透：箭矢穿过第一个敌人，对身后一格再判定 60% */
      if(p.pierce){
        const owner = p.owner;
        for(const e of G.units){
          if(e.side===owner.side || !e.alive) continue;
          if(tileDist(e, t.pierceRef||t) <= 1.5 && e.uid!==t.uid) rawDamage(e, p.dmg*0.6);
        }
      }
      /* 震撼：命中减速（精英 / BOSS 同样吃控制减免，2 秒 → 1.4 秒） */
      if(p.shock && !t.isBase){
        t.slowUntil = gameTime + applyCcResist(t, 2, true); t.slowMul = 0.7;
      }
      PROJ.splice(i,1);
    } else {
      p.x += dx/d*step; p.y += dy/d*step;
    }
  }

  /* ---- 清理死亡单位 ---- */
  for(let i=G.units.length-1;i>=0;i--){
    if(!G.units[i].alive) G.units.splice(i,1);
  }

  /* ---- 飘字 ---- */
  for(let i=G.floats.length-1;i>=0;i--){
    const f=G.floats[i]; f.life-=dt; f.y-=22*dt;
    if(f.life<=0){ G.floats.splice(i,1); }
    else if(f.dom){
      f.dom.style.left=(f.x*(f.sx||1))+'px';
      f.dom.style.top=(f.y*(f.sx||1))+'px';
      f.dom.style.opacity=Math.min(1,f.life*2);
    }
  }

  /* ---- 高亮淡出 ---- */
  for(let i=G.flashTiles.length-1;i>=0;i--){
    G.flashTiles[i].life -= dt;
    if(G.flashTiles[i].life<=0) G.flashTiles.splice(i,1);
  }

  /* ---- 轰炸预警倒计时与爆炸（毁灭魔龙） ---- */
  for(let i=G.bombWarnings.length-1; i>=0; i--){
    const w = G.bombWarnings[i];
    w.timer -= dt;
    if(w.timer <= 0){
      G.bombWarnings.splice(i,1);
      sfx('explode');                        // 爆炸轰鸣
      /* 爆炸：半径内玩家单位受全额伤害。
         注意：魔龙的轰炸【不会伤及基地】—— 即使基地落在预警圈里也毫发无损，
         所以它只是逼你撤兵的后排压制手段，不能靠它直接拆家。 */
      let hitUnits = 0;
      for(const p of G.units){
        if(p.side!=='player' || !p.alive) continue;
        if(tileDist(p, w) <= w.radius){ damageUnit(p, w.dmg, null, {}); hitUnits++; }
      }
      /* 爆炸视觉反馈 */
      showFloat((w.c+0.5)*TILE, (w.r+0.5)*TILE, '💥 轰炸!', '#ff6b4a');
      for(let dc=-w.radius; dc<=w.radius; dc++){
        for(let dr=-w.radius; dr<=w.radius; dr++){
          if(dc*dc+dr*dr > w.radius*w.radius) continue;
          G.flashTiles.push({ c:w.c+dc, r:w.r+dr, life:0.6, color:'#ff6b4a' });
        }
      }
      logLine(`💥 轰炸命中：${hitUnits} 个我方单位（${w.dmg} 伤，不伤及基地）`, 'neg');
    }
  }

  /* ---- 天打雷劈：5 道落雷（2 秒预警 → 落雷，半径 1 格 / 7 伤 / 不伤基地） ----
     节奏：预警 2 秒后落雷；每落一道雷，间隔 3 秒再出下一道预警（雷与雷相隔 3 秒）。
     预警钉在【出预警那一刻】目标所在格 —— 单位走开 2 格以上就能躲掉，可操作性在这。 */
  if(G.thunder && G.thunder.fired < G.thunder.total){
    const th = G.thunder;
    th.nextIn -= dt;
    if(th.nextIn <= 0){
      const alive = th.uids
        .map(uid=>G.units.find(u=>u.uid===uid && u.alive))
        .filter(Boolean);
      if(alive.length){
        const t = alive[rndInt(0, alive.length-1)];
        G.thunderWarnings.push({
          uid:t.uid, c:t.c, r:t.r,
          timer:th.warn, total:th.warn, dmg:th.dmg, radius:th.radius,
        });
        sfx('warn');
        showBanner(`⚠ 天打雷劈：第 ${th.fired+1}/${th.total} 道雷锁定【${t.name}】，${th.warn} 秒后落下`, 'neg');
      }
      th.fired++;
      th.nextIn = th.interval;
      if(th.fired >= th.total && !G.thunderWarnings.length) G.thunder = null;
    }
  }
  for(let i=G.thunderWarnings.length-1; i>=0; i--){
    const w = G.thunderWarnings[i];
    w.timer -= dt;
    if(w.timer <= 0){
      G.thunderWarnings.splice(i,1);
      sfx('explode');
      /* 落雷：半径 1 格内的己方【单位】受 7 点伤害；基地不在 G.units 中，
         这里再显式排除 isBase —— 雷不会劈家，被锁定的单位走开就能躲。 */
      let hitUnits = 0;
      for(const p of G.units){
        if(p.side!=='player' || !p.alive || p.isBase) continue;
        if(tileDist(p, w) <= w.radius){ damageUnit(p, w.dmg, null, {}); hitUnits++; }
      }
      showFloat((w.c+0.5)*TILE, (w.r+0.5)*TILE, '⚡ 落雷!', '#8ecbff');
      for(let dc=-w.radius; dc<=w.radius; dc++){
        for(let dr=-w.radius; dr<=w.radius; dr++){
          if(dc*dc+dr*dr > w.radius*w.radius) continue;
          G.flashTiles.push({ c:w.c+dc, r:w.r+dr, life:0.5, color:'#8ecbff' });
        }
      }
      logLine(`⚡ 落雷命中：${hitUnits} 个我方单位（${w.dmg} 伤，半径 ${w.radius} 格，不伤基地）`, 'neg');
      if(G.thunder && G.thunder.fired >= G.thunder.total && !G.thunderWarnings.length) G.thunder = null;
    }
  }

  /* 注：横幅提示条（#banner）的计时故意不放在这里。
     它按【真实秒】推进，且必须在战场暂停时也能正常消失，
     所以统一由 stepFrame() → tickBanner() 处理。 */
}

/* 单位是否处于眩晕中（眩晕期间不动不攻） */
function isStunned(u){ return !!(u && u.stunUntil && gameTime < u.stunUntil); }
/* 给目标挂眩晕：圣剑士专属。Lv2「圣光斩」有 15% 概率眩晕时间 ×3 */
function applyStunTo(target, source){
  if(!target || target.isBase || !target.alive || !source || !source.stun) return;
  let dur = source.stun;
  if(source.pas && source.pas.stunSplash && Math.random() < 0.15){
    dur *= 3;
    showFloat(target.x, target.y-30, '强昏迷!', '#ffe089');
  }
  /* 精英 / BOSS 的控制减免：眩晕时长按 ccResist 打折（默认 30%）。
     不然一发圣剑士的眩晕就能把 BOSS 定在原地，精英/BOSS 的压迫感全没了。 */
  target.stunUntil = Math.max(target.stunUntil || 0, gameTime + applyCcResist(target, dur));
}
/* 单位的控制减免（0 ~ 1）：单位自带 ccResist 优先（makeUnit 里已按 tier 落值），
   兜底再按 tier 判一次，普通单位没有。 */
function ccResistOf(u){
  if(!u) return 0;
  if(typeof u.ccResist === 'number') return clamp(u.ccResist, 0, 1);
  return (u.tier === 'elite' || u.tier === 'boss') ? CC_RESIST_TIER : 0;
}
/* 把一段控制时长按目标的控制减免打折，命中精英/BOSS 时飘一行提示。
   silent=true 时不飘字（减速是逐箭触发的，飘字会刷屏）。 */
function applyCcResist(target, dur, silent){
  const resist = ccResistOf(target);
  if(resist <= 0) return dur;
  const out = dur * (1 - resist);
  if(!silent) showFloat(target.x, target.y-42, `控制减免 ${Math.round(resist*100)}%`, '#8ecbff');
  return out;
}

/* 玩家单位发动一次攻击（含连射/溅射/穿透/震撼被动 + 高地加成） */
function attack(u, target){
  if(!target) return;
  /* 伤害 = 基础攻 × 地形 × 回合增益（火力支援） × 光环（守卫者统率） */
  const dmg = u.dmg * atkDmgMul(u) * (G.allyDmgMul || 1) * allyAtkAuraMul(u);
  if(u.kind==='ranged'){
    fireProjectile(u, target, dmg, {
      splash: u.splash || (u.pas&&u.pas.demolition ? 0.5 : 0),
      splashRadius: (u.pas&&u.pas.demolition) ? 2 : 1,
      pierce: !!(u.pas&&u.pas.pierce),
      shock: !!(u.pas&&u.pas.shock),
    });
    /* 连射：30% 概率立即再射一箭 */
    if(u.pas && u.pas.volley && Math.random()<0.30){
      fireProjectile(u, target, dmg, {});
      showFloat(u.x, u.y-30, '连射!', '#ffe089');
    }
  } else {
    damageUnit(target, dmg, u, { melee:true, attacker:u });
    applyStunTo(target, u);
    /* Lv2「圣光斩」：攻击变范围 —— 目标相邻格的敌人吃 50% 伤害（同样会眩晕） */
    if(u.pas && u.pas.stunSplash){
      for(const e of G.units){
        if(!e.alive || e===target || e.side!==target.side) continue;
        if(tileDist(e, target) <= 1){
          damageUnit(e, dmg*0.5, u, { melee:true, attacker:u });
          applyStunTo(e, u);
        }
      }
    }
  }
}

/* 友军攻击力光环（守卫者）：场上有活着的守卫者时，己方单位伤害 +15%（含守卫者自己）。
   与「火力支援」等回合增益是相乘关系，各算各的。 */
function allyAtkAuraMul(u){
  if(!u || u.side !== 'player' || !G || !G.units) return 1;
  for(const a of G.units){
    if(a.alive && a.side==='player' && a.allyAtkAura) return 1 + a.allyAtkAura;
  }
  return 1;
}

/* 攻击者的地形伤害加成（高地 +25%，飞行单位不受地形影响） */
function atkDmgMul(u){
  if(u.flying) return 1;
  const terr = terrainAt(u.c, u.r);
  if(terr && terr.dmgBonus) return 1 + terr.dmgBonus;
  return 1;
}

const PROJ = [];
function fireProjectile(from, to, dmg, opts){
  opts = opts || {};
  PROJ.push({
    x:from.x, y:from.y, target:to,
    dmg: dmg!=null ? dmg : from.dmg,
    speed:TILE*8, owner:from,
    splash: opts.splash||0,
    splashRadius: opts.splashRadius||1,
    pierce: !!opts.pierce,
    shock: !!opts.shock,
  });
  from.shotFlash = 0.12;
}

/* ============================================================
   10. 绘制（像素风）
   ============================================================ */
const cv = document.getElementById('board');
const ctx = cv.getContext('2d');
cv.width = W; cv.height = H;
ctx.imageSmoothingEnabled = false;

/* 地面纹理缓存（含地形格） */
let groundPattern = null;
function buildGround(){
  const off = document.createElement('canvas');
  off.width=W; off.height=H;
  const o = off.getContext('2d');
  const showTerrain = terrainEnabled();   // 与 passable() 共用同一开关，避免"看不见却挡路"
  // 草原底色
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      o.fillStyle = ((c+r)%2===0) ? '#2f4a34' : '#2a4230';
      o.fillRect(c*TILE, r*TILE, TILE, TILE);
      // 像素噪点
      o.fillStyle = ((c+r)%2===0) ? 'rgba(80,130,80,.18)' : 'rgba(60,100,60,.18)';
      for(let i=0;i<5;i++){
        const px = c*TILE + ((i*13+c*7)%TILE);
        const py = r*TILE + ((i*29+r*11)%TILE);
        o.fillRect(px, py, 4, 4);
      }
      // 地形覆盖（仅第二关）
      const terr = showTerrain ? terrainAt(c,r) : null;
      if(terr){
        const X0=c*TILE, Y0=r*TILE;
        if(terr.id==='forest'){
          o.fillStyle='rgba(22,52,30,.92)'; o.fillRect(X0,Y0,TILE,TILE);
          o.fillStyle='#1d3f26';
          for(let i=0;i<3;i++){
            const tx=X0+8+i*16, ty=Y0+TILE-8-i*3;
            o.fillRect(tx-5,ty-14,10,14);
            o.fillRect(tx-9,ty-26,18,14);
            o.fillRect(tx-6,ty-36,12,12);
          }
        } else if(terr.id==='hill'){
          o.fillStyle='rgba(96,84,48,.95)'; o.fillRect(X0,Y0,TILE,TILE);
          o.fillStyle='#7a6a3c';
          o.fillRect(X0+4,Y0+TILE-26,TILE-8,22);
          o.fillStyle='#9a8850';
          o.fillRect(X0+10,Y0+TILE-42,TILE-20,18);
          o.fillStyle='#bcae78';
          o.fillRect(X0+18,Y0+TILE-52,TILE-36,12);
        } else if(terr.id==='swamp'){
          o.fillStyle='rgba(58,54,30,.95)'; o.fillRect(X0,Y0,TILE,TILE);
          o.fillStyle='rgba(90,86,44,.7)';
          o.beginPath(); o.ellipse(X0+TILE*0.5,Y0+TILE*0.55,TILE*0.36,TILE*0.24,0,0,Math.PI*2); o.fill();
          o.fillStyle='rgba(120,116,60,.55)';
          o.beginPath(); o.ellipse(X0+TILE*0.4,Y0+TILE*0.4,10,5,0,0,Math.PI*2); o.fill();
        } else if(terr.id==='rock'){
          o.fillStyle='#3c3c46'; o.fillRect(X0,Y0,TILE,TILE);
          o.fillStyle='#585868';
          o.fillRect(X0+6,Y0+14,18,26);
          o.fillRect(X0+30,Y0+22,16,20);
          o.fillStyle='#767686'; o.fillRect(X0+6,Y0+14,18,7);
          o.fillStyle='#2a2a32'; o.fillRect(X0+2,Y0+TILE-8,TILE-4,8);
        }
      }
    }
  }
  groundPattern = off;
}

/* 地形图标（常驻小标记，画在地面之上） */
function drawTerrainIcons(){
  for(const [key,id] of activeTerrainMap()){
    const [c,r] = key.split(',').map(Number);
    const terr = TERRAIN[id];
    const ctr = tileCenter(c,r);
    ctx.font = '18px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.85;
    ctx.fillText(terr.icon, ctr.x, ctr.y+6);
    ctx.globalAlpha = 1;
  }
}

function draw(){
  if(!G) return;
  ctx.clearRect(0,0,W,H);

  // 地面
  if(groundPattern) ctx.drawImage(groundPattern,0,0);
  else { ctx.fillStyle='#2a4230'; ctx.fillRect(0,0,W,H); }

  // 网格线（像素感）
  ctx.strokeStyle='rgba(0,0,0,.20)';
  ctx.lineWidth=1;
  for(let c=0;c<=COLS;c++){ ctx.beginPath(); ctx.moveTo(c*TILE+.5,0); ctx.lineTo(c*TILE+.5,H); ctx.stroke(); }
  for(let r=0;r<=ROWS;r++){ ctx.beginPath(); ctx.moveTo(0,r*TILE+.5); ctx.lineTo(W,r*TILE+.5); ctx.stroke(); }

  // 召唤可放置高亮
  if(G.pendingSummon){
    for(let dc=-2;dc<=2;dc++)for(let dr=-2;dr<=2;dr++){
      const c=BASE_TILE.c+dc, r=BASE_TILE.r+dr;
      if(!passable(c,r)) continue;
      const ok = !occupiedAt(c,r);
      ctx.fillStyle = ok ? 'rgba(77,208,255,.22)' : 'rgba(255,77,77,.18)';
      ctx.fillRect(c*TILE+2, r*TILE+2, TILE-4, TILE-4);
      if(ok){
        ctx.strokeStyle='rgba(77,208,255,.55)';
        ctx.lineWidth=2;
        ctx.strokeRect(c*TILE+2.5, r*TILE+2.5, TILE-5, TILE-5);
      }
    }
  }

  // 高亮格
  for(const f of G.flashTiles){
    const a = clamp(f.life,0,1);
    ctx.fillStyle = f.color || `rgba(255,207,77,${0.3*a})`;
    ctx.fillRect(f.c*TILE+2, f.r*TILE+2, TILE-4, TILE-4);
  }

  // 地形图标（仅第二关）
  if(G.lv.hasTerrain) drawTerrainIcons();

  // 刷怪点标记（所有关卡都标；双路关标上下两路，单路关只标一个）
  drawSpawnMarkers();

  // 防线指示（近战防线 / 远程支援线）
  drawDefenseLines();

  // 矿场
  drawMine();
  // 基地
  drawBase();

  // 选中单位可移动范围提示 / 目标标记
  if(G.selectedUnit!=null){
    const u = G.units.find(x=>x.uid===G.selectedUnit && x.alive);
    if(u){
      ctx.strokeStyle='rgba(255,207,77,.9)';
      ctx.lineWidth=3;
      ctx.strokeRect(u.c*TILE+1.5, u.r*TILE+1.5, TILE-3, TILE-3);
      // 绘制路径预览虚线
      if(G.hoverTile){
        const p = aStar({c:u.c,r:u.r},{c:G.hoverTile.c,r:G.hoverTile.r});
        if(p){
          ctx.setLineDash([6,5]);
          ctx.strokeStyle='rgba(77,208,255,.75)';
          ctx.lineWidth=3;
          ctx.beginPath();
          p.forEach((n,i)=>{ const ctr=tileCenter(n.c,n.r); i?ctx.lineTo(ctr.x,ctr.y):ctx.moveTo(ctr.x,ctr.y); });
          ctx.stroke();
          ctx.setLineDash([]);
          const end=tileCenter(G.hoverTile.c,G.hoverTile.r);
          ctx.fillStyle='rgba(77,208,255,.3)';
          ctx.fillRect(G.hoverTile.c*TILE+3,G.hoverTile.r*TILE+3,TILE-6,TILE-6);
        }
      }
    }
  }

  // 单位（按 y 排序，营造前后遮挡）
  const drawList = G.units.filter(u=>u.alive).sort((a,b)=>a.y-b.y);
  /* 矿场格允许多个矿工叠加 → 给他们一点错位，避免完全重叠看不出数量。
     按"每格"分组（而不是整块矿场），因为矿场有 4 格，各格的矿工本就分得开。 */
  const mineStack = {};   // key "c,r" -> 已画数量
  for(const u of drawList){
    if(u.side==='player' && u.typeId==='miner' && isMineTile(u.c, u.r)){
      const k = u.c+','+u.r;
      const n = mineStack[k] || 0;
      mineStack[k] = n + 1;
      u._stackOff = n===0 ? {dx:0, dy:0}
                 : {dx: (n%2 ? -1 : 1) * (6 + Math.floor(n/2)*3),
                    dy: (n%2 ? -1 : 1) * (4 + Math.floor(n/2)*3)};
    } else {
      u._stackOff = null;
    }
  }
  for(const u of drawList) drawUnit(u);

  /* 骷髅王破体动画：压在单位之上，容器那格会"裂开" */
  drawKingBurst();

  /* 轰炸预警圈（毁灭魔龙）：红色脉冲圆圈 + 倒计时 */
  for(const w of G.bombWarnings){
    const ctr = tileCenter(w.c, w.r);
    const rr = (w.radius + 0.35) * TILE;
    const t = performance.now()/1000;
    const pulse = 0.35 + 0.25*Math.sin(t*10);
    /* 危险区 */
    ctx.fillStyle = `rgba(255,107,74,${0.14 + 0.10*Math.sin(t*10)})`;
    ctx.beginPath();
    ctx.arc(ctr.x, ctr.y, rr, 0, Math.PI*2);
    ctx.fill();
    /* 边界圈 */
    ctx.strokeStyle = `rgba(255,80,50,${0.7 + 0.3*pulse})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([10,8]);
    ctx.beginPath();
    ctx.arc(ctr.x, ctr.y, rr, 0, Math.PI*2);
    ctx.stroke();
    ctx.setLineDash([]);
    /* 倒计时 */
    ctx.fillStyle = '#ff5030';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(w.timer.toFixed(1), ctr.x, ctr.y - rr - 8);
  }

  /* 落雷预警圈（天打雷劈）：蓝白脉冲 + 倒计时，半径 1 格 */
  for(const w of G.thunderWarnings){
    const ctr = tileCenter(w.c, w.r);
    const rr = (w.radius + 0.3) * TILE;
    const t = performance.now()/1000;
    ctx.fillStyle = `rgba(142,203,255,${0.12 + 0.10*Math.sin(t*12)})`;
    ctx.beginPath();
    ctx.arc(ctr.x, ctr.y, rr, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = `rgba(200,232,255,${0.65 + 0.35*Math.sin(t*12)})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([6,6]);
    ctx.beginPath();
    ctx.arc(ctr.x, ctr.y, rr, 0, Math.PI*2);
    ctx.stroke();
    ctx.setLineDash([]);
    /* 头顶闪电符号 + 倒计时 */
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText('⚡', ctr.x, ctr.y + 5);
    ctx.fillStyle = '#8ecbff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(w.timer.toFixed(1), ctr.x, ctr.y - rr - 8);
  }

  /* 被「天打雷劈」锁定的单位：头顶持续挂一个闪电标记 */
  if(G.thunder){
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8ecbff';
    for(const uid of G.thunder.uids){
      const u = G.units.find(x=>x.uid===uid && x.alive);
      if(u) ctx.fillText('⚡', u.x, u.y - 34);
    }
  }

  // 弹道
  for(const p of PROJ){
    ctx.fillStyle = '#ffe089';
    ctx.fillRect(p.x-3,p.y-3,6,6);
    ctx.fillStyle = 'rgba(255,224,137,.4)';
    ctx.fillRect(p.x-5,p.y-5,10,10);
  }

  // 出怪预告（HUD，压在所有单位之上 —— 布阵时看到本回合各口要出什么）
  drawSpawnPreviewHud();

  // 悬浮信息
  drawHoverInfo();
}

/* 像素小人绘制器 */
function px(x,y,w,h,color){ ctx.fillStyle=color; ctx.fillRect(Math.round(x),Math.round(y),w,h); }

function drawUnit(u){
  const bob = u.moving ? Math.sin(performance.now()/120)*2 : Math.sin(performance.now()/450 + u.uid)*1;
  const off = u._stackOff || {dx:0, dy:0};
  const x = u.x + off.dx, y = u.y + bob + off.dy;
  const s = TILE;
  const cx = x, cy = y;

  // 影子
  ctx.fillStyle='rgba(0,0,0,.32)';
  ctx.beginPath(); ctx.ellipse(cx, y+20, 15, 6, 0, 0, Math.PI*2); ctx.fill();

  const swing = (u.swing||0)>0;
  const atkLean = swing ? 4 : 0;

  if(u.typeId==='swordsman'){
    const body = u.lv>1 ? '#c9d6ff' : '#9aa8d8';
    const trim = u.lv>1 ? '#ffcf4d' : '#5a6690';
    // 腿
    px(cx-8, cy+8, 6, 10, '#3a4270');
    px(cx+2, cy+8, 6, 10, '#3a4270');
    // 身体
    px(cx-10, cy-8, 20, 18, body);
    px(cx-10, cy-8, 20, 4, trim);
    // 头
    px(cx-7, cy-20, 14, 12, '#f0c9a0');
    // 头盔
    px(cx-9, cy-24, 18, 7, '#4a5480');
    px(cx-9, cy-24, 18, 3, '#6a76a8');
    // 剑
    px(cx+11+atkLean, cy-14, 4, 22, '#dfe7ff');
    px(cx+9+atkLean, cy+4, 8, 4, '#8a94c0');
    // 盾
    px(cx-16, cy-6, 6, 14, trim);
  }
  else if(u.typeId==='archer'){
    const body = u.lv>1 ? '#b9f0c8' : '#7fc99a';
    const trim = u.lv>1 ? '#ffcf4d' : '#4a8a63';
    px(cx-7, cy+8, 5, 10, '#2f4a3a');
    px(cx+2, cy+8, 5, 10, '#2f4a3a');
    px(cx-9, cy-8, 18, 18, body);
    px(cx-9, cy-8, 18, 4, trim);
    px(cx-6, cy-20, 12, 12, '#f0c9a0');
    // 兜帽
    px(cx-9, cy-23, 18, 8, '#3a7a55');
    // 弓
    ctx.strokeStyle = u.lv>1 ? '#ffcf4d' : '#c9a06a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx+12+atkLean, cy-2, 13, -1.15, 1.15);
    ctx.stroke();
    // 箭
    if(swing){ px(cx+14, cy-4, 16, 3, '#ffe089'); }
  }
  else if(u.typeId==='miner'){
    px(cx-7, cy+6, 6, 12, '#3a3a4a');
    px(cx+1, cy+6, 6, 12, '#3a3a4a');
    px(cx-9, cy-8, 18, 16, '#a07a4a');
    px(cx-6, cy-20, 12, 12, '#f0c9a0');
    // 安全帽
    px(cx-9, cy-25, 18, 6, '#e0a020');
    px(cx-12, cy-21, 24, 3, '#e0a020');
    px(cx-2, cy-29, 4, 5, '#fff4c0');   // 头灯
    // 镐
    px(cx+10, cy-16, 4, 24, '#8a6040');
    px(cx+6, cy-18, 14, 4, '#c0c8d8');
  }
  else if(u.typeId==='monster'){
    const body='#a83a4a', dark='#7a2434';
    px(cx-8, cy+8, 6, 10, dark);
    px(cx+2, cy+8, 6, 10, dark);
    px(cx-11, cy-10, 22, 20, body);
    px(cx-11, cy-10, 22, 4, dark);
    px(cx-8, cy-22, 16, 13, '#c04a5a');
    // 眼睛
    px(cx-5, cy-18, 4, 4, '#ffe040');
    px(cx+2, cy-18, 4, 4, '#ffe040');
    // 角
    px(cx-12, cy-26, 4, 7, dark);
    px(cx+8, cy-26, 4, 7, dark);
    // 爪
    px(cx+11+atkLean, cy-4, 5, 12, '#e0e0e0');
  }
  else if(u.typeId==='boss'){
    const body='#6a2a8a', dark='#481a5e', glow='#c06cff';
    const pulse = 0.5+0.5*Math.sin(performance.now()/260);
    // 光环
    ctx.fillStyle=`rgba(192,108,255,${0.18+0.14*pulse})`;
    ctx.beginPath(); ctx.ellipse(cx, cy+2, 30, 30, 0,0,Math.PI*2); ctx.fill();
    px(cx-11, cy+12, 8, 13, dark);
    px(cx+3, cy+12, 8, 13, dark);
    px(cx-16, cy-12, 32, 26, body);
    px(cx-16, cy-12, 32, 5, glow);
    px(cx-11, cy-30, 22, 19, '#8a3ab0');
    // 眼
    px(cx-8, cy-24, 6, 6, '#ff2a4a');
    px(cx+2, cy-24, 6, 6, '#ff2a4a');
    px(cx-7, cy-23, 3, 3, '#ffd0d8');
    px(cx+3, cy-23, 3, 3, '#ffd0d8');
    // 大角
    px(cx-20, cy-36, 6, 12, glow);
    px(cx+14, cy-36, 6, 12, glow);
    // 巨斧
    px(cx+16+atkLean, cy-20, 6, 34, '#2a2a3a');
    px(cx+12+atkLean, cy-24, 18, 12, '#b0b8d0');
    px(cx+12+atkLean, cy-24, 18, 4, '#e8ecff');
  }

  else if(u.typeId==='guardian'){
    /* 守卫者：天降神兵砸下来的石像守卫 ——
       整块花岗岩凿出来的巨汉，石缝里透金光，头顶一圈神光，抡拳头砸人。
       70 血 3 攻的肉盾，比剑士壮一圈、比 BOSS 矮一头（不进商店、无等级）。 */
    const stone   = '#727a8a';   // 石身
    const stoneLt = '#98a1b2';   // 受光面
    const stoneHi = '#c2cadb';   // 高光棱
    const stoneDk = '#474d5b';   // 暗面
    const crack   = '#2c313b';   // 石缝
    const gold    = '#ffcf4d';
    const goldLt  = '#fff3c4';
    const pulse   = 0.5+0.5*Math.sin(performance.now()/420);

    // 神光：脚下一团金光 + 头顶光环
    ctx.fillStyle = `rgba(255,207,77,${0.10+0.12*pulse})`;
    ctx.beginPath(); ctx.ellipse(cx, cy+4, 30, 32, 0, 0, Math.PI*2); ctx.fill();

    // 腿（两根粗石柱）
    px(cx-12, cy+6,  9, 15, stoneDk);
    px(cx+3,  cy+6,  9, 15, stoneDk);
    px(cx-12, cy+6,  9, 3,  stone);
    px(cx+3,  cy+6,  9, 3,  stone);
    px(cx-12, cy+17, 9, 4,  crack);
    px(cx+3,  cy+17, 9, 4,  crack);

    // 躯干（一大块石料，上亮下暗）
    px(cx-14, cy-13, 28, 22, stone);
    px(cx-14, cy-13, 28, 4,  stoneLt);
    px(cx-14, cy-13, 3,  22, stoneLt);      // 左侧受光
    px(cx+11, cy-13, 3,  22, stoneDk);
    px(cx-14, cy+5,  28, 4,  stoneDk);
    // 腰（石缝）
    px(cx-14, cy-2,  28, 2,  crack);
    // 石纹
    px(cx-9,  cy-11, 2, 8,  crack);
    px(cx+6,  cy-6,  2, 7,  crack);
    px(cx-3,  cy-13, 2, 5,  crack);
    // 胸口符文（金光会呼吸）
    px(cx-3, cy+0, 6, 4, gold);
    px(cx-1, cy-3, 2, 10, `rgba(255,207,77,${0.35+0.35*pulse})`);

    // 肩甲（两块方石压肩）
    px(cx-19, cy-16, 8, 10, stoneLt);
    px(cx-19, cy-16, 8, 3,  stoneHi);
    px(cx+11, cy-16, 8, 10, stoneLt);
    px(cx+11, cy-16, 8, 3,  stoneHi);

    // 头（凿出来的方脑袋，没有五官，只有两点神光）
    // 先画脑后那圈神光，再把头压上去 → 只在头两侧露出金边，不会顶到血条
    ctx.strokeStyle = `rgba(255,214,90,${0.55+0.35*pulse})`;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(cx, cy-23, 15, 8, 0, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,225,${0.3+0.3*pulse})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy-23, 15, 8, 0, 0, Math.PI*2); ctx.stroke();
    px(cx-9,  cy-29, 18, 15, stone);
    px(cx-9,  cy-29, 18, 4,  stoneLt);
    px(cx-9,  cy-16, 18, 2,  crack);
    px(cx-9,  cy-29, 3,  15, stoneLt);
    px(cx+6,  cy-29, 3,  15, stoneDk);
    ctx.fillStyle = `rgba(255,207,77,${0.18+0.22*pulse})`;
    ctx.fillRect(cx-6, cy-25, 12, 7);        // 眼窝微光
    px(cx-6, cy-24, 4, 4, gold);
    px(cx+2, cy-24, 4, 4, gold);
    px(cx-5, cy-23, 2, 2, goldLt);
    px(cx+3, cy-23, 2, 2, goldLt);

    // 手臂 + 拳（蓄力时后拉，出手时前砸）
    const fistX = swing ? 5 : 0;
    px(cx-24, cy-12, 8, 12, stoneDk);        // 左臂
    px(cx-26, cy-3,  11, 11, stone);         // 左拳
    px(cx-26, cy-3,  11, 3,  stoneLt);
    px(cx+16, cy-12, 8, 12, stone);          // 右臂
    px(cx+16, cy-3,  11, 11, stone);         // 右拳
    px(cx+16, cy-3,  11, 3,  stoneLt);
    px(cx+18+fistX, cy+5, 8, 5, stoneDk);    // 拳下阴影
    if(swing){
      // 砸击的金色冲击弧
      ctx.strokeStyle = `rgba(255,226,140,${0.5+0.3*pulse})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx+10, cy-2, 24, -0.5, 0.9); ctx.stroke();
    }
  }
  else if(u.typeId==='shield'){
    /* 盾卫：厚重盾牌 + 铁盔 */
    const body = u.lv>1 ? '#d8c9a0' : '#a89878';
    const trim = u.lv>1 ? '#ffcf4d' : '#6a5a3a';
    px(cx-9, cy+8, 7, 10, '#4a4232');
    px(cx+2, cy+8, 7, 10, '#4a4232');
    px(cx-11, cy-8, 22, 18, body);
    px(cx-11, cy-8, 22, 4, trim);
    px(cx-7, cy-19, 14, 12, '#e8c098');
    // 铁盔
    px(cx-9, cy-23, 18, 7, '#8a8aa0');
    px(cx-3, cy-30, 6, 8, '#b0b0c8');
    // 大盾（左侧）
    px(cx-19, cy-14, 9, 26, '#9aa4c0');
    px(cx-19, cy-14, 9, 4, '#c8d0e8');
    px(cx-17, cy-6, 5, 10, trim);
  }
  else if(u.typeId==='gunner'){
    const body = u.lv>1 ? '#c9a86a' : '#8a7050';
    const trim = u.lv>1 ? '#ffcf4d' : '#5a4830';
    px(cx-8, cy+8, 6, 10, '#3a3222');
    px(cx+1, cy+8, 6, 10, '#3a3222');
    px(cx-10, cy-8, 20, 18, body);
    px(cx-10, cy-8, 20, 4, trim);
    px(cx-7, cy-20, 14, 12, '#e8c098');
    px(cx-10, cy-24, 20, 6, '#4a4030');   // 皮帽
    // 火炮（扛在右肩）
    px(cx+8+atkLean, cy-16, 24, 9, '#3a3a44');
    px(cx+26+atkLean, cy-18, 8, 13, '#5a5a68');
    if(swing){ px(cx+34+atkLean, cy-16, 10, 7, '#ffd24d'); }
  }
  else if(u.typeId==='holyblade'){
    /* 圣剑士：白金甲 + 双手圣剑 + 微光 */
    const body = u.lv>1 ? '#eef3ff' : '#c8d4ea';
    const trim = u.lv>1 ? '#ffcf4d' : '#8fa4c8';
    const pulse = 0.5+0.5*Math.sin(performance.now()/320);
    ctx.fillStyle=`rgba(255,240,180,${0.05+0.05*pulse})`;
    ctx.beginPath(); ctx.ellipse(cx, cy, 26, 26, 0,0,Math.PI*2); ctx.fill();
    // 腿
    px(cx-8, cy+8, 6, 10, '#3a4a70');
    px(cx+2, cy+8, 6, 10, '#3a4a70');
    // 战裙 + 身体
    px(cx-10, cy+2, 20, 8, trim);
    px(cx-10, cy-8, 20, 12, body);
    px(cx-10, cy-8, 20, 3, trim);
    // 胸口十字纹
    px(cx-2, cy-6, 4, 9, trim);
    px(cx-6, cy-3, 12, 3, trim);
    // 头 + 头盔（金羽饰）
    px(cx-7, cy-20, 14, 12, '#f0c9a0');
    px(cx-9, cy-24, 18, 6, '#dfe7ff');
    px(cx-9, cy-24, 18, 2, '#ffffff');
    px(cx-2, cy-30, 4, 7, '#ffcf4d');
    // 双手剑
    px(cx+10+atkLean, cy-24, 5, 28, '#eef3ff');
    px(cx+13+atkLean, cy-24, 2, 28, '#ffcf4d');
    px(cx+8+atkLean, cy+2, 9, 4, '#8a94c0');
    if(swing){
      ctx.strokeStyle='rgba(255,242,170,.9)';
      ctx.lineWidth=4;
      ctx.beginPath(); ctx.arc(cx+4, cy-8, 27, -1.0, 0.55); ctx.stroke();
    }
  }
  else if(u.typeId==='skullking'){
    /* 骷髅王：披风 + 骨腔 + 金冠 + 血眼，手里一根巨大的骨杖。
       整体压在 cy-36 以上不画东西 —— 血条在 cy-40，别让王冠顶上去。 */
    const bone='#efe9dc', boneDk='#b9b2a1', boneSh='#8d8676';
    const gold='#ffcf4d', goldLt='#fff3c4';
    const cape='#3a2450', capeDk='#241533';
    const pulse=0.5+0.5*Math.sin(performance.now()/300);
    /* BOSS 底光：脚下一圈暗金，把骷髅王从灰绿地图里衬出来 */
    const bossGlow = ctx.createRadialGradient(cx, cy+8, 4, cx, cy+8, 40);
    bossGlow.addColorStop(0, `rgba(255,207,77,${0.20+0.10*pulse})`);
    bossGlow.addColorStop(1, 'rgba(255,207,77,0)');
    ctx.fillStyle = bossGlow;
    ctx.beginPath(); ctx.ellipse(cx, cy+8, 40, 26, 0, 0, Math.PI*2); ctx.fill();
    // 亡者威压
    ctx.fillStyle=`rgba(150,90,255,${0.10+0.12*pulse})`;
    ctx.beginPath(); ctx.ellipse(cx, cy+2, 34, 34, 0, 0, Math.PI*2); ctx.fill();
    // 披风（先画，压在身后）
    px(cx-20, cy-14, 40, 34, capeDk);
    px(cx-17, cy-12, 34, 30, cape);
    // 腿骨
    px(cx-9,  cy+8,  6, 14, bone);
    px(cx+3,  cy+8,  6, 14, bone);
    px(cx-9,  cy+16, 6, 4,  boneDk);
    px(cx+3,  cy+16, 6, 4,  boneDk);
    // 骨盆 + 脊柱
    px(cx-8,  cy+2,  16, 7,  bone);
    px(cx-8,  cy+2,  16, 2,  boneDk);
    px(cx-2,  cy-12, 4,  15, boneSh);
    // 肋骨（4 根，两端点暗）
    for(let i=0;i<4;i++){
      px(cx-11, cy-11+i*4, 22, 3, bone);
      px(cx-11, cy-11+i*4, 3,  3, boneDk);
      px(cx+8,  cy-11+i*4, 3,  3, boneDk);
    }
    // 肩骨
    px(cx-15, cy-14, 8, 6, bone);
    px(cx+7,  cy-14, 8, 6, bone);
    // 头骨
    px(cx-9,  cy-26, 18, 15, bone);
    px(cx-9,  cy-26, 18, 3,  '#fffaf0');
    px(cx-9,  cy-26, 3,  15, boneDk);
    // 眼窝（血红，会呼吸）
    px(cx-6,  cy-22, 5, 5, '#180810');
    px(cx+1,  cy-22, 5, 5, '#180810');
    px(cx-5,  cy-21, 3, 3, `rgba(255,70,96,${0.65+0.35*pulse})`);
    px(cx+2,  cy-21, 3, 3, `rgba(255,70,96,${0.65+0.35*pulse})`);
    // 牙
    px(cx-6,  cy-13, 12, 2, boneSh);
    // 王冠：金环 + 三根尖
    px(cx-10, cy-31, 20, 5, gold);
    px(cx-10, cy-31, 20, 2, goldLt);
    px(cx-10, cy-36, 4,  6, gold);
    px(cx-2,  cy-35, 4,  5, gold);
    px(cx+6,  cy-36, 4,  6, gold);
    px(cx-3,  cy-29, 3,  3, '#ff4d6d');   // 冠上血玉
    // 骨杖（挥击时前压）
    px(cx+14+atkLean, cy-22, 5, 30, boneDk);
    px(cx+12+atkLean, cy-28, 9, 8,  bone);
    px(cx+12+atkLean, cy-28, 9, 2,  '#fffaf0');
    px(cx+14+atkLean, cy-30, 5, 3,  `rgba(255,70,96,${0.5+0.4*pulse})`);
    if(swing){
      ctx.strokeStyle=`rgba(255,90,120,${0.45+0.3*pulse})`;
      ctx.lineWidth=5;
      ctx.beginPath(); ctx.arc(cx+6, cy-6, 30, -0.8, 0.7); ctx.stroke();
    }
  }
  else if(u.typeId==='skeleton'){
    /* 骷髅：白骨 + 骨棒 */
    const bone='#e8e4d8', boneDark='#b8b2a0';
    px(cx-7, cy+8, 5, 10, boneDark);
    px(cx+2, cy+8, 5, 10, boneDark);
    // 肋骨
    px(cx-8, cy-6, 16, 15, bone);
    for(let i=0;i<3;i++) px(cx-6, cy-3+i*4, 12, 2, '#9a947f');
    // 头骨 + 眼窝 + 牙
    px(cx-8, cy-20, 16, 13, bone);
    px(cx-6, cy-16, 4, 4, '#2a2430');
    px(cx+2, cy-16, 4, 4, '#2a2430');
    px(cx-4, cy-10, 8, 2, '#9a947f');
    // 骨棒
    px(cx+9+atkLean, cy-10, 4, 16, boneDark);
    px(cx+5+atkLean, cy-15, 12, 6, bone);
  }
  else if(u.typeId==='skullguard'){
    /* 持盾骷髅：精英，高大骨身 + 铁盾 + 红瞳 */
    const bone='#ded8c8', boneDark='#a8a290';
    const pulse = 0.5+0.5*Math.sin(performance.now()/300);
    ctx.fillStyle=`rgba(200,110,140,${0.10+0.10*pulse})`;
    ctx.beginPath(); ctx.ellipse(cx, cy, 34, 34, 0,0,Math.PI*2); ctx.fill();
    // 腿
    px(cx-10, cy+12, 7, 13, boneDark);
    px(cx+3, cy+12, 7, 13, boneDark);
    // 躯干 + 肋骨
    px(cx-12, cy-12, 24, 26, bone);
    for(let i=0;i<4;i++) px(cx-8, cy-8+i*5, 16, 2, '#9a9482');
    // 肩甲
    px(cx-17, cy-14, 7, 9, '#7a7a90');
    px(cx+10, cy-14, 7, 9, '#7a7a90');
    // 头骨 + 红瞳
    px(cx-9, cy-30, 18, 16, bone);
    px(cx-6, cy-26, 5, 5, '#ff3a4a');
    px(cx+1, cy-26, 5, 5, '#ff3a4a');
    px(cx-4, cy-19, 8, 3, '#9a9482');
    // 头盔
    px(cx-11, cy-34, 22, 6, '#6a6a80');
    px(cx-3, cy-40, 6, 8, '#8a8aa0');
    // 大盾（左侧）
    px(cx-23, cy-16, 11, 30, '#8a94b0');
    px(cx-23, cy-16, 11, 4, '#c0c8e0');
    px(cx-20, cy-8, 6, 12, '#6a6a80');
    // 剑
    px(cx+13+atkLean, cy-20, 5, 28, '#c8d0e0');
    px(cx+11+atkLean, cy+4, 9, 4, '#6a6a80');
  }
  else if(u.typeId==='flyer'){
    /* 飞行怪：蝙蝠 */
    const flap = Math.sin(performance.now()/90)*6;
    ctx.fillStyle='#6a4a8a';
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx-22,cy-8-flap); ctx.lineTo(cx-6,cy+6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+22,cy-8-flap); ctx.lineTo(cx+6,cy+6); ctx.closePath(); ctx.fill();
    px(cx-8, cy-6, 16, 16, '#4a3468');
    px(cx-5, cy-10, 10, 6, '#5a4078');
    px(cx-5, cy-6, 3, 3, '#ff4d6d');
    px(cx+2, cy-6, 3, 3, '#ff4d6d');
    // 悬空阴影
    ctx.fillStyle='rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(cx, u.y+22, 12, 4, 0,0,Math.PI*2); ctx.fill();
  }
  else if(u.typeId==='sapper'){
    /* 矿场破坏者：背着炸药桶 */
    px(cx-7, cy+8, 6, 10, '#3a2a20');
    px(cx+1, cy+8, 6, 10, '#3a2a20');
    px(cx-10, cy-8, 20, 18, '#7a4a2a');
    px(cx-10, cy-8, 20, 4, '#a06030');
    px(cx-7, cy-20, 14, 12, '#c07a4a');
    px(cx-5, cy-18, 4, 4, '#ffe040');
    px(cx+1, cy-18, 4, 4, '#ffe040');
    // 炸药桶
    px(cx-16, cy-4, 12, 18, '#b03030');
    px(cx-16, cy-4, 12, 4, '#e05050');
    px(cx-13, cy-14, 3, 6, '#ffcf4d');
    // 引线火花
    const sp = Math.sin(performance.now()/80)>0;
    if(sp) px(cx-12, cy-18, 4, 4, '#ffd24d');
  }
  else if(u.typeId==='ram'){
    /* 攻城槌：巨大的木槌 */
    px(cx-14, cy+6, 10, 14, '#5a4020');
    px(cx+4, cy+6, 10, 14, '#5a4020');
    px(cx-16, cy-12, 32, 22, '#8a6a3a');
    px(cx-16, cy-12, 32, 5, '#a88450');
    px(cx-10, cy-28, 20, 17, '#a07840');
    px(cx-7, cy-24, 5, 5, '#ff8040');
    px(cx+2, cy-24, 5, 5, '#ff8040');
    // 撞锤
    px(cx+14+atkLean, cy-8, 24, 12, '#4a3a20');
    px(cx+34+atkLean, cy-14, 14, 24, '#8a8a9a');
  }
  else if(u.typeId==='shaman'){
    /* 萨满：法杖 + 光环 */
    const pulse = 0.5+0.5*Math.sin(performance.now()/400);
    ctx.fillStyle=`rgba(90,220,160,${0.12+0.10*pulse})`;
    ctx.beginPath(); ctx.ellipse(cx, cy+2, 42, 42, 0,0,Math.PI*2); ctx.fill();
    px(cx-7, cy+8, 5, 10, '#2a4a3a');
    px(cx+2, cy+8, 5, 10, '#2a4a3a');
    px(cx-9, cy-8, 18, 18, '#3a7a5a');
    px(cx-9, cy-8, 18, 4, '#5aa87a');
    px(cx-6, cy-20, 12, 12, '#d8e8c0');
    px(cx-8, cy-24, 16, 6, '#2a5a3a');   // 兜帽
    // 法杖
    px(cx+10, cy-18, 4, 28, '#8a6a4a');
    ctx.fillStyle=`rgba(90,240,160,${0.6+0.4*pulse})`;
    ctx.beginPath(); ctx.arc(cx+12, cy-22, 7, 0, Math.PI*2); ctx.fill();
  }
  else if(u.typeId==='wolf'){
    /* 狼骑：四足冲刺 */
    px(cx-12, cy+6, 6, 10, '#4a3a2a');
    px(cx-4, cy+6, 6, 10, '#4a3a2a');
    px(cx+4, cy+6, 6, 10, '#4a3a2a');
    px(cx+10, cy+6, 6, 10, '#4a3a2a');
    px(cx-14, cy-8, 30, 16, '#6a5a48');
    px(cx-14, cy-8, 30, 4, '#8a7a60');
    px(cx+14, cy-12, 14, 14, '#7a6a58');
    px(cx+24, cy-8, 6, 6, '#3a2a1a');    // 鼻
    px(cx+18, cy-14, 5, 5, '#ff4d4d');   // 眼
    // 背上的骑手
    px(cx-6, cy-24, 12, 12, '#5a4a3a');
    px(cx-3, cy-30, 8, 8, '#d8a878');
  }
  else if(u.typeId==='warlord'){
    /* 攻城领主：BOSS，紫黑光晕 + 巨槌 */
    const body='#4a2a6a', dark='#2a1640', glow='#ff5a7a';
    const pulse = 0.5+0.5*Math.sin(performance.now()/240);
    ctx.fillStyle=`rgba(255,90,122,${0.16+0.14*pulse})`;
    ctx.beginPath(); ctx.ellipse(cx, cy+2, 38, 38, 0,0,Math.PI*2); ctx.fill();
    // 统御光环
    ctx.strokeStyle=`rgba(255,90,122,${0.25+0.2*pulse})`;
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(cx, cy+4, pxDistTiles(3), 0, Math.PI*2); ctx.stroke();
    px(cx-13, cy+14, 9, 14, dark);
    px(cx+4, cy+14, 9, 14, dark);
    px(cx-18, cy-14, 36, 30, body);
    px(cx-18, cy-14, 36, 5, glow);
    px(cx-12, cy-34, 24, 20, '#6a3a90');
    px(cx-9, cy-27, 7, 7, '#ff2a4a'); px(cx+2, cy-27, 7, 7, '#ff2a4a');
    px(cx-8, cy-26, 3, 3, '#ffd0d8'); px(cx+3, cy-26, 3, 3, '#ffd0d8');
    // 王冠
    px(cx-14, cy-40, 28, 6, '#ffcf4d');
    px(cx-12, cy-47, 5, 8, '#ffcf4d'); px(cx-3, cy-49, 5, 10, '#ffcf4d'); px(cx+6, cy-47, 5, 8, '#ffcf4d');
    // 巨槌
    px(cx+18+atkLean, cy-22, 7, 38, '#2a2a3a');
    px(cx+13+atkLean, cy-26, 20, 13, '#c0c8d8');
    px(cx+13+atkLean, cy-26, 20, 4, '#f0f4ff');
  }
  else if(u.typeId==='overlord'){
    /* 毁灭魔龙：第三关 BOSS，飞行单位，浮空 + 扇翼 + 蓄能红光 */
    const fly = -26 + Math.sin(performance.now()/300)*4;   // 浮空起伏
    const fy = cy + fly;
    const flap = Math.sin(performance.now()/130)*6;        // 扇翼
    const pulse = 0.5+0.5*Math.sin(performance.now()/250);
    // 蓄能红光（冷却将到时更亮）
    const charging = u.bombCd !== undefined ? Math.max(0, 1 - u.bombCd/3) : 0;
    ctx.fillStyle=`rgba(255,107,74,${0.10 + 0.22*charging*(0.6+0.4*pulse)})`;
    ctx.beginPath(); ctx.ellipse(cx, fy, 40, 34, 0,0,Math.PI*2); ctx.fill();
    // 翅膀（扇动）
    px(cx-34, fy-20+flap, 22, 8, '#3a2a5a');
    px(cx-40, fy-14+flap, 14, 6, '#2a1e40');
    px(cx+12, fy-20-flap, 22, 8, '#3a2a5a');
    px(cx+26, fy-14-flap, 14, 6, '#2a1e40');
    // 身体
    px(cx-12, fy-14, 24, 30, '#5a3a8a');
    px(cx-12, fy-14, 24, 5, '#7a56b8');
    px(cx-10, fy+14, 20, 10, '#4a2f70');   // 尾
    px(cx+8, fy+18, 12, 6, '#3a2558');
    // 头
    px(cx-9, fy-32, 18, 16, '#6a46a0');
    px(cx-7, fy-24, 5, 5, '#ffe14d');  px(cx+2, fy-24, 5, 5, '#ffe14d');
    // 龙角
    px(cx-10, fy-40, 4, 9, '#d8cfa8'); px(cx+6, fy-40, 4, 9, '#d8cfa8');
    // 鼻孔喷火点（蓄能时喷火）
    if(charging > 0.3){
      px(cx-4, fy-18, 8, 6, `rgba(255,${120+80*charging},60,${0.5+0.5*charging})`);
    }
  }

  // 天官赐福标记：头顶一颗金星（升级/翻倍后一直保留）
  if(u.blessed){
    const by0 = cy - 40;
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px "Press Start 2P", monospace';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.85)';
    try{ ctx.strokeText('★', cx, by0 - 20); }catch(e){}
    ctx.fillStyle = '#ffe089';
    ctx.fillText('★', cx, by0 - 20);
  }

  // 血条（精英 / BOSS 额外套一圈分级色边框）
  const bw=34, bh=5, bx=cx-bw/2, by=cy-40;
  const tierInfo = u.tier ? TIER_INFO[u.tier] : null;
  if(tierInfo){
    ctx.fillStyle = tierInfo.color;
    ctx.fillRect(bx-3, by-3, bw+6, bh+6);
    ctx.fillStyle = 'rgba(0,0,0,.86)';
    ctx.fillRect(bx-1, by-1, bw+2, bh+2);
  } else {
    ctx.fillStyle='rgba(0,0,0,.8)';
    ctx.fillRect(bx-2,by-2,bw+4,bh+4);
  }
  ctx.fillStyle = u.side==='enemy' ? '#6a1020' : '#1a4a2a';
  ctx.fillRect(bx,by,bw,bh);
  const ratio = clamp(u.hp/u.hpMax,0,1);
  ctx.fillStyle = u.side==='enemy' ? '#ff4d6d' : '#5ddc7a';
  ctx.fillRect(bx,by,bw*ratio,bh);
  // 等级标记
  if(u.lv>1){
    ctx.fillStyle='#ffcf4d';
    ctx.font='bold 13px "Press Start 2P", monospace';
    ctx.textAlign='center';
    ctx.fillText('★'+u.lv, cx, by-6);
  }
  // 分级徽标：精英 / BOSS（与登场介绍呼应，混战中也能一眼认出）
  if(tierInfo){
    const label = u.tier==='boss' ? 'BOSS' : '精英';
    let tw = 34;
    try{ const m = ctx.measureText(label); if(m && m.width) tw = m.width + 10; }catch(e){}
    const tx = cx - tw/2, ty = by - 16;
    ctx.fillStyle = 'rgba(0,0,0,.78)';
    ctx.fillRect(tx-1, ty-1, tw+2, 13);
    ctx.fillStyle = tierInfo.color;
    ctx.fillRect(tx, ty, tw, 11);
    ctx.fillStyle = '#12101a';
    ctx.font='bold 10px "Press Start 2P", monospace';
    ctx.textAlign='center';
    ctx.fillText(label, cx, ty+9);
  }
}

function drawBase(){
  const ctr = tileCenter(BASE_TILE.c,BASE_TILE.r);
  const x=ctr.x, y=ctr.y;
  // 地基
  ctx.fillStyle='#5a5240';
  ctx.fillRect(x-30, y-6, 60, 30);
  ctx.fillStyle='#3a3428';
  ctx.fillRect(x-30, y+18, 60, 8);
  // 城墙
  px(x-30, y-30, 60, 28, '#8a8470');
  px(x-30, y-30, 60, 6, '#a8a290');
  for(let i=0;i<6;i++){ px(x-30+i*11, y-38, 7, 10, '#8a8470'); }
  // 门
  px(x-10, y-16, 20, 22, '#3a2a1a');
  px(x-8, y-14, 16, 20, '#2a1e12');
  px(x-2, y-6, 4, 4, '#ffcf4d');
  // 旗
  px(x-1, y-58, 3, 22, '#5a5240');
  ctx.fillStyle='#ff4d6d';
  ctx.beginPath();
  ctx.moveTo(x+2,y-58); ctx.lineTo(x+24,y-50); ctx.lineTo(x+2,y-42); ctx.closePath(); ctx.fill();
  // 生命
  px(x-26, y+34, 52, 8, 'rgba(0,0,0,.7)');
  const ratio = clamp(G.baseHp/G.baseHpMax,0,1);
  px(x-25, y+35, 50*ratio, 6, ratio>0.5?'#5ddc7a':ratio>0.25?'#ffcf4d':'#ff4d6d');
}

/* 骷髅王破体动画：尸体抽搐 → 骨刺隆起 → 白闪爆开
   直接在容器倒下的那一格上画，动画结束（tickKingBurst）才真正生成 BOSS。 */
function drawKingBurst(){
  const b = G && G.kingBurst;
  if(!b) return;
  const ctr = tileCenter(b.c, b.r);
  const k = clamp(b.t / b.dur, 0, 1);        // 0 → 1
  const pulse = 0.5 + 0.5*Math.sin(b.t*16);

  ctx.save();
  /* ⓪ 先把这一格原有的东西压暗，动画才读得出来（不然骨堆跟地图一个色） */
  ctx.fillStyle = `rgba(6,4,12,${0.45 + 0.35*k})`;
  ctx.beginPath();
  ctx.ellipse(ctr.x, ctr.y, TILE*0.72, TILE*0.72, 0, 0, Math.PI*2);
  ctx.fill();

  /* ① 紫红色的不祥光晕，越到后面越大 */
  ctx.fillStyle = `rgba(190,50,120,${0.16 + 0.34*k})`;
  ctx.beginPath();
  ctx.ellipse(ctr.x, ctr.y, TILE*(0.45 + 1.15*k), TILE*(0.36 + 0.95*k), 0, 0, Math.PI*2);
  ctx.fill();
  /* 外圈一道细边，边界更清楚 */
  ctx.strokeStyle = `rgba(255,90,150,${0.35 + 0.4*k})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(ctr.x, ctr.y, TILE*(0.45 + 1.15*k), TILE*(0.36 + 0.95*k), 0, 0, Math.PI*2);
  ctx.stroke();

  /* ② 尸体：一具抽搐的骨堆（前半段抖得厉害） */
  const shake = k < 0.6 ? Math.sin(b.t*46)*(3*k+1) : 0;
  const bx = ctr.x + shake, by = ctr.y + Math.max(0, k-0.6)*10;
  const bone='#e8e2d4', boneDk='#a8a190';
  px(bx-12, by+8,  24, 5, boneDk);            // 散落的腿骨
  px(bx-8,  by+2,  16, 6, bone);              // 骨盆
  px(bx-9,  by-4,  18, 6, bone);              // 胸骨
  px(bx-6,  by-8,  12, 5, bone);              // 头骨
  px(bx-4,  by-7,  3,  3, '#2a2030');
  px(bx+1,  by-7,  3,  3, '#2a2030');

  /* ③ 骨刺从体内往外顶 */
  if(k > 0.35){
    const sp = Math.min(1, (k-0.35)/0.45);
    ctx.strokeStyle = `rgba(240,236,225,${0.5+0.4*sp})`;
    ctx.lineWidth = 3;
    for(let i=0;i<7;i++){
      const a = -Math.PI/2 + (i-3)*0.42;
      const len = TILE*(0.35 + 0.55*sp) * (0.7 + 0.3*Math.sin(i*2.1 + b.t*6));
      ctx.beginPath();
      ctx.moveTo(ctr.x + Math.cos(a)*8, ctr.y + Math.sin(a)*8);
      ctx.lineTo(ctr.x + Math.cos(a)*len, ctr.y + Math.sin(a)*len);
      ctx.stroke();
    }
  }

  /* ④ 最后 20%：白光炸开 */
  if(k > 0.8){
    const f = (k-0.8)/0.2;
    ctx.fillStyle = `rgba(255,255,255,${0.35*f*(0.6+0.4*pulse)})`;
    ctx.beginPath(); ctx.ellipse(ctr.x, ctr.y, TILE*(0.6+f), TILE*(0.5+f), 0,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

/* 刷怪点标记
   单路关（第一关 / 后续单路关）只标一个下路刷怪点。 */
/* 出怪口列表（单路关只有一个「敌军来袭」口） */
function spawnMarks(){
  /* 多出怪口（第五关）：两个口都标出来；预告面板只画在第 1 个口旁边，
     否则同一份"本回合出怪"会在两个口各画一遍 */
  const ports = spawnPortsOf();
  if(ports){
    /* 每个口一份独立预告：面板画在自己那个口旁边，
       玩家一眼能看出"左边来什么、右边来什么、下面来什么" */
    return ports.map((p,i)=>({
      t:p, label:p.label || `出怪口 ${i+1}`,
      key:p.key || 'lower', color:'#ff4d6d', noPanel:false,
    }));
  }
  return G.lv.hasLanes
    ? [ { t:SPAWN_UPPER, label:'上路', key:'upper', color:'#ff9a3c' },
        { t:SPAWN_LOWER, label:'下路', key:'lower', color:'#ff4d6d' } ]
    : [ { t:SPAWN_LOWER, label:'敌军来袭', key:'lower', color:'#ff4d6d' } ];
}

function drawSpawnMarkers(){
  for(const m of spawnMarks()){
    const ctr = tileCenter(m.t.c, m.t.r);
    const pulse = 0.5+0.5*Math.sin(performance.now()/420);
    ctx.strokeStyle = m.color;
    ctx.globalAlpha = 0.5+0.4*pulse;
    ctx.lineWidth = 3;
    ctx.setLineDash([6,5]);
    ctx.strokeRect(m.t.c*TILE+4, m.t.r*TILE+4, TILE-8, TILE-8);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = m.color;
    ctx.font = 'bold 10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(m.label, ctr.x, ctr.y - TILE*0.4);
  }
}

/* 出怪预告 HUD：单独一趟画在所有单位之上（否则会和刷出来的怪叠在一起） */
function drawSpawnPreviewHud(){
  for(const m of spawnMarks()) drawSpawnPreviewPanel(m);
}

/* 出怪口旁的「本回合出怪」小面板：图标 × 数量 + 剩余计数。
   出完后面板变灰并标注「已出完」；该口本回合无怪则整个面板不画。 */
function drawSpawnPreviewPanel(m){
  if(!G || G.phase !== 'playing') return;
  if(m.noPanel) return;                  // 多出怪口：只画在第一个口旁边
  const pv = G.spawnPreview;
  const slot = pv && pv[m.key];
  if(!slot || !slot.has) return;

  /* 文本宽度：真实浏览器量字宽，量不到时按字符估算（测试桩也安全） */
  const textW = (s, font) => {
    ctx.font = font;
    const mt = ctx.measureText ? ctx.measureText(s) : null;
    const w = mt && typeof mt.width === 'number' ? mt.width : 0;
    return (isFinite(w) && w > 0) ? w : s.length * 8;
  };
  const F_ICON  = '13px "Segoe UI Emoji", "Press Start 2P", monospace';
  const F_TITLE = 'bold 9px "Press Start 2P", monospace';

  const rem   = spawnPreviewRemain(m.key).map(r => `${r.emoji}×${r.count}`);
  const title = slot.done ? '本回合已出完 ✓' : `本回合出怪 · 剩 ${slot.queue.length}`;
  const w = Math.max(92, Math.max(textW(rem.join('  '), F_ICON), textW(title, F_TITLE)) + 16);
  const h = slot.done ? 26 : 46;

  const ctr = tileCenter(m.t.c, m.t.r);
  let x = m.t.c*TILE - w - 6;                       // 默认贴在出怪口左侧
  if(x < 2) x = clamp(m.t.c*TILE + TILE + 6, 2, W - w - 2);
  const y = clamp(ctr.y - h/2, 2, H - h - 2);

  ctx.save();
  ctx.fillStyle = 'rgba(10,14,12,.84)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = slot.done ? 'rgba(150,170,160,.75)' : m.color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x+1, y+1, w-2, h-2);
  ctx.textAlign = 'center';
  ctx.fillStyle = slot.done ? 'rgba(150,170,160,.95)' : m.color;
  ctx.font = F_TITLE;
  ctx.fillText(title, x + w/2, y + 14);
  if(!slot.done){
    ctx.font = F_ICON;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(rem.join('  '), x + w/2, y + 34);
  }
  ctx.restore();
}

/* 防线可视化：近战防线（红）+ 远程支援线（蓝）
   没设防线的关（第五关：基地在环心，没有"一条竖线"可言）整段跳过 */
function drawDefenseLines(){
  if(LINE_COL == null && SUPPORT_COL == null) return;
  const t = performance.now()/700;
  const pulse = 0.55 + 0.45*Math.sin(t);

  // 近战防线
  if(LINE_COL != null){
  const lx = LINE_COL*TILE + TILE/2;
  ctx.save();
  ctx.setLineDash([10,8]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(255,90,110,${0.28+0.18*pulse})`;
  ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, H); ctx.stroke();
  ctx.setLineDash([]);
  // 顶部标签
  ctx.fillStyle = `rgba(255,90,110,${0.55+0.25*pulse})`;
  ctx.font = 'bold 11px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('⚔ 防线', lx, 16);
  ctx.restore();
  }

  // 远程支援线
  if(SUPPORT_COL != null){
  const sx = SUPPORT_COL*TILE + TILE/2;
  ctx.save();
  ctx.setLineDash([6,10]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(77,208,255,${0.18+0.12*pulse})`;
  ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = `rgba(77,208,255,${0.4+0.2*pulse})`;
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('🏹 支援', sx, 16);
  ctx.restore();
  }
}

/* 矿场：2×2 共 4 格。
   画法：先整块打底（发光 + 地面），再画中央的主矿洞与支架，
   四角各画一小块矿石，最后标 "矿场 +10/回合/格"。 */
function drawMine(){
  const c0=MINE_TILE.c, r0=MINE_TILE.r;
  const x0=c0*TILE, y0=r0*TILE;          // 整块左上角像素
  const w=TILE*2, h=TILE*2;              // 整块 2×2 像素
  const cx=x0+w/2, cy=y0+h/2;            // 整块中心
  const pulse=0.5+0.5*Math.sin(performance.now()/600);

  ctx.save();

  /* ---- 1. 整块打底（挖开的矿脉地表） ---- */
  ctx.fillStyle='#3d3428';
  ctx.fillRect(x0+1, y0+1, w-2, h-2);
  ctx.fillStyle='#4a4030';
  ctx.fillRect(x0+4, y0+4, w-8, h-8);
  /* 四格的接缝（让"4 格"看得见，又不割裂整体） */
  ctx.fillStyle='rgba(0,0,0,.22)';
  ctx.fillRect(x0+TILE-1, y0+3, 2, h-6);
  ctx.fillRect(x0+3, y0+TILE-1, w-6, 2);

  /* ---- 2. 外圈发光（整块） ---- */
  ctx.fillStyle=`rgba(255,207,77,${0.10+0.10*pulse})`;
  ctx.beginPath(); ctx.ellipse(cx,cy,w*0.52,h*0.52,0,0,Math.PI*2); ctx.fill();

  /* ---- 3. 中央主矿洞（跨格，位于整块中心） ---- */
  ctx.fillStyle='#4a4030';
  ctx.beginPath(); ctx.ellipse(cx,cy+8,44,32,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#1a1410';
  ctx.beginPath(); ctx.ellipse(cx,cy+11,30,21,0,0,Math.PI*2); ctx.fill();
  /* 洞口内壁高光 */
  ctx.strokeStyle='rgba(255,207,77,.28)';
  ctx.lineWidth=2;
  ctx.beginPath(); ctx.ellipse(cx,cy+11,30,21,0,Math.PI*0.15,Math.PI*0.85); ctx.stroke();

  /* ---- 4. 支架（横跨整块顶部） ---- */
  px(cx-40, cy-42, 6, 44, '#7a5a3a');
  px(cx+34, cy-42, 6, 44, '#7a5a3a');
  px(cx-40, cy-47, 80, 7, '#8a6a4a');
  px(cx-40, cy-47, 80, 2, '#a07c56');     // 横梁高光

  /* ---- 5. 每格一块矿石（4 格 = 4 块，暗示每格都能驻矿工） ---- */
  const t=performance.now()/400;
  MINE_TILES.forEach((tl,i)=>{
    const p=tileCenter(tl.c, tl.r);
    const bob=Math.sin(t+i*1.3)*2;
    const ox = (i%2 ? 17 : -17), oy = (i<2 ? 15 : 21);
    px(p.x+ox-4, p.y+oy+bob-4, 8, 8, '#ffcf4d');
    px(p.x+ox-3, p.y+oy+bob-3, 4, 4, '#fff0b0');
    px(p.x+ox-5, p.y+oy+bob-5, 3, 3, '#c99a2e');
  });

  /* ---- 6. 标签 ---- */
  ctx.textAlign='center';
  ctx.fillStyle='#ffcf4d';
  ctx.font='bold 12px "Press Start 2P", monospace';
  ctx.fillText('矿场', cx, y0-12);
  ctx.fillStyle='#ffe9a8';
  ctx.font='10px "Press Start 2P", monospace';
  ctx.fillText('4格 · 每格 +10/回合', cx, y0+4);

  ctx.restore();
}

function drawHoverInfo(){
  if(!G.hoverTile) return;
  const {c,r}=G.hoverTile;
  ctx.strokeStyle='rgba(255,255,255,.35)';
  ctx.lineWidth=2;
  ctx.strokeRect(c*TILE+1,r*TILE+1,TILE-2,TILE-2);
}

/* ============================================================
   11. 输入
   ============================================================ */
let hoverTile=null;
let pendingReward=null;

cv.addEventListener('mousemove', e=>{
  const rect = cv.getBoundingClientRect();
  const sx = cv.width/rect.width, sy = cv.height/rect.height;
  const x = (e.clientX-rect.left)*sx, y=(e.clientY-rect.top)*sy;
  G.hoverTile = pxToTile(x,y);
});
cv.addEventListener('mouseleave', ()=>{ if(G) G.hoverTile=null; });

cv.addEventListener('click', e=>{
  if(!G || G.phase!=='playing') return;
  const rect = cv.getBoundingClientRect();
  const sx = cv.width/rect.width, sy = cv.height/rect.height;
  const x = (e.clientX-rect.left)*sx, y=(e.clientY-rect.top)*sy;
  const {c,r}=pxToTile(x,y);

  // 1. 召唤放置
  if(G.pendingSummon){ tryPlaceSummon(c,r); return; }

  // 2. 点到己方单位 → 选中
  const u = G.units.find(z=>z.alive && z.c===c && z.r===r && z.side==='player');
  if(u && G.selectedUnit===null){ selectUnit(u); return; }
  if(u && G.selectedUnit!==null && u.uid!==G.selectedUnit){ selectUnit(u); return; }

  // 3. 已选单位 + 点空地 → 移动
  if(G.selectedUnit!==null){
    const sel = G.units.find(z=>z.uid===G.selectedUnit && z.alive);
    if(sel){
      if(sel.c===c && sel.r===r){ G.selectedUnit=null; updateUI(); return; }
      commandMove(sel, c, r);
    }
    return;
  }
});

/* 键盘：空格结束回合 / ESC 取消 */
window.addEventListener('keydown', e=>{
  if(!G || G.phase!=='playing') return;
  // 奖励选择弹窗打开时，空格/ESC 不生效（必须先选士兵）
  const rewardOpen = !$('overlay').classList.contains('hidden');
  if(rewardOpen) return;
  if(e.code==='Space'){ e.preventDefault(); endTurn(); }
  if(e.code==='Escape'){ G.pendingSummon=null; G.selectedUnit=null; updateUI(); }
});

/* ============================================================
   12. UI 渲染
   ============================================================ */
const $ = id=>document.getElementById(id);

function updateUI(){
  if(!G) return;
  // 顶栏
  $('hp-text').textContent = `${Math.ceil(G.baseHp)} / ${G.baseHpMax}`;
  $('hp-fill').style.width = clamp(G.baseHp/G.baseHpMax,0,1)*100 + '%';
  $('gold-text').textContent = Math.floor(G.gold);
  $('ap-text').textContent = `${G.ap} / ${G.apMax}`;
  $('round-text').textContent = `${G.round} / ${G.lv.rounds}`;

  // 关卡名 + 商店面板显隐
  const lt = $('level-name');
  if(lt) lt.textContent = `第${G.lv.id}关 · ${G.lv.name}`;
  const shopPanel = $('shop-panel');
  if(shopPanel) shopPanel.style.display = G.lv.hasShop ? '' : 'none';

  // 行动值不足时着色
  $('ap-text').style.color = G.ap>0 ? 'var(--ap)' : 'var(--txt-dim)';

  renderCards();
  renderShop();
  renderLog();

  // 结束回合按钮
  const eb = $('btn-end-turn');
  eb.disabled = G.turnPhase!=='action' || G.phase!=='playing';
  eb.textContent = G.turnPhase==='event' ? '事件处理中…' :
                   G.turnPhase==='enemy' ? '敌方行动中…' :
                   (G.round>=G.lv.rounds ? '结束回合 · 结算' : '结束回合 ▶');
}

/* 数字格式化：整数不带小数点，非整数保留 dp 位并去掉尾随 0
   （6 → "6"；1.5 → "1.5"；1.875 → "1.88"） */
function fmtNum(n, dp){
  const d = (dp == null) ? 1 : dp;
  if(Number.isInteger(n)) return String(n);
  return String(+(+n).toFixed(d));
}

/* 士兵属性简介（所有"士兵介绍"场景统一走这里）
   血 / 伤 / 攻击距离；无攻击力的单位（矿工）单独说明。
   m    = 血/伤的升级倍率（UPGRADE_MULT 复利）
   rMul = 攻击距离的升级倍率（线性，缺省时与 m 相同，便于"只看倍率"的调用） */
/* 兵种定位：近战 / 远程 / 驻守（矿工）。卡片、天赋详情、图鉴、商店共用一套说法 */
function unitKindLabel(t){
  if(!t) return '';
  if(t.kind === 'none' || !(t.range > 0)) return '驻守';
  return t.kind === 'ranged' ? '远程' : '近战';
}

function unitStatLine(t, m, rMul){
  const mul = m || 1;
  const rm  = (rMul == null) ? mul : rMul;
  const hp  = Math.round(t.hp * mul);
  const dmg = fmtNum(t.dmg * mul, 2);
  if(t.kind === 'none' || !(t.range > 0)) return `驻守 · 血 ${hp} · 无攻击（驻守矿场产金）`;
  return `${unitKindLabel(t)} · 血 ${hp} · 伤 ${dmg} · 攻击距离 ${fmtNum(t.range * rm)} 格`;
}

function renderCards(){
  const wrap = $('card-list');
  wrap.innerHTML='';
  for(const id of CARD_ORDER){
    const c = G.cards[id];
    if(!c) continue;
    const t = BASE[id];
    const b = document.createElement('div');
    const lvM = Math.pow(UPGRADE_MULT, c.lv-1);
    const left = summonLeft(c);
    const cap = unitCap(id), cur = unitCount(id);
    const capLeft = cap - cur;
    const apCost = t.cost || 1;                 // 守卫者 = 2 点行动值
    const canSummon = left>0 && capLeft>0 && G.ap>=apCost && G.turnPhase==='action' && G.phase==='playing';

    b.className = 'card' + (c.lv>1?' lv2':'') + (!canSummon ? ' disabled':'');
    b.innerHTML = `
      <div class="card-art">${t.emoji}</div>
      <div class="card-info">
        <div class="card-name">${t.name} ${c.lv>1?`<span class="lv">Lv.${c.lv}</span>`:''}<span class="card-kind">${unitKindLabel(t)}</span></div>
        <div class="card-stats">
          血 <b>${Math.round(t.hp*lvM)}</b> · 伤 <span class="dmg">${fmtNum(t.dmg*lvM, 2)}</span><br>
          ${t.kind==='none' ? '驻守矿场产金币'
            : `攻击距离 <b>${fmtNum(t.range*rangeUpgradeMul(c.lv))}</b> 格 · 速 ${fmtNum(t.moveSpeed*lvM)}格/秒<br>攻速 ${(t.atkRate*lvM).toFixed(2)}`}
        </div>
      </div>
      <div class="card-actions">
        <button class="card-btn summon" ${canSummon?'':'disabled'}>召唤 ⚡${apCost}</button>
        <button class="card-btn info-btn" title="查看天赋详情">天赋 ℹ</button>
      </div>
      <div class="summon-pips" title="本回合剩余召唤次数">${summonPips(Math.min(left, capLeft))}<em class="cap-count">场上 ${cur}/${cap}</em></div>
    `;
    b.querySelector('.summon').onclick = (e)=>{ e.stopPropagation(); beginSummon(id); };
    b.querySelector('.info-btn').onclick = (e)=>{ e.stopPropagation(); openTalentDetail(id); };
    b.onclick = ()=> openTalentDetail(id);   // 左键点卡片任意处也可查看详情
    wrap.appendChild(b);
  }
}

/* 召唤次数指示点：●●○ = 还可召唤 2 次 */
function summonPips(left){
  let s = '';
  for(let i=0;i<SUMMON_PER_TURN;i++){
    s += `<span class="pip${i<left?' on':''}"></span>`;
  }
  return `<span class="pips-inner">${s}</span>${left<=0?'<em>已用完</em>':''}`;
}

/* 渲染商店货架（第一关 / 第二关均开放）
   第一关 shopCards=false：只有升级卡与补给，没有"解锁新兵种"。 */
function renderShop(){
  const list = $('shop-list');
  if(!list) return;
  const panel = $('shop-panel');
  if(G.lv && !G.lv.hasShop){
    if(panel) panel.style.display = 'none';
    return;
  }
  if(panel) panel.style.display = '';
  /* 面板标题 + 商店说明随关卡变化 */
  const title = panel && panel.querySelector('.shop-title span');
  if(title){
    title.textContent = (G.lv && G.lv.shopCards===false)
      ? '🏪 商店 · 升级 / 补给'
      : '🏪 商店 · 常驻';
  }
  list.innerHTML = '';
  const canBuy = G.turnPhase==='action' && G.phase==='playing';

  if(!G.shop.slots.length){
    const e = document.createElement('div');
    e.className = 'shop-empty';
    e.textContent = '货架已空，点击刷新';
    list.appendChild(e);
  }

  G.shop.slots.forEach((it, i)=>{
    const row = document.createElement('div');
    const afford = G.gold >= it.price;
    row.className = 'shop-item' + (canBuy && afford ? '' : ' disabled');
    const emoji = it.emoji || (it.typeId ? BASE[it.typeId].emoji : '❔');
    let sub = '';
    if(it.kind==='card'){
      const bt = it.typeId ? BASE[it.typeId] : (it.id && BASE[it.id]);
      sub = bt
        ? `解锁新兵种 · ${(bt.kind==='none'||!(bt.range>0)) ? '无攻击' : `${unitKindLabel(bt)} · 攻距 ${fmtNum(bt.range)} 格`}`
        : '解锁新兵种';
      /* 守卫者这种精英卡：副标题直接报它的招牌特性，不用点进天赋才看到 */
      if(bt && bt.deathBomb){
        sub = `精英·限1只·⚡${bt.cost||1}·阵亡自爆`;
      }
    }
    if(it.kind==='upgrade') sub = `升至 Lv${it.lv}`;
    if(it.kind==='supply')  sub = it.id==='medkit' ? '全场士兵回满血' : '+3 行动值';
    row.innerHTML = `
      <div class="shop-art">${emoji}</div>
      <div class="shop-info">
        <div class="shop-name">${it.name}</div>
        <div class="shop-sub">${sub}</div>
      </div>
      <button class="shop-buy">◈${it.price}</button>
    `;
    row.querySelector('.shop-buy').onclick = (e)=>{ e.stopPropagation(); buyShopItem(i); };
    list.appendChild(row);
  });

  /* 刷新按钮 */
  const rb = $('btn-refresh');
  if(rb){
    const canRefresh = canBuy && G.shop.refreshLeft>0 && G.ap>=REFRESH_AP && G.gold>=REFRESH_GOLD;
    rb.disabled = !canRefresh;
    rb.textContent = `刷新货架 ⚡1 ◈5（剩 ${G.shop.refreshLeft}）`;
  }
}

function logLine(text, cls){
  if(!G) return;
  G.log.push({text, cls:cls||''});
  if(G.log.length>60) G.log.shift();
  renderLog();
}
function renderLog(){
  const el = $('log');
  el.innerHTML = G.log.map(l=>`<div class="log-item ${l.cls}">${l.text}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

/* 横幅（#banner）与 toast 的显示时长，单位【秒】。
   注意：这里必须是秒 —— bannerTimer 每帧减的是 dt（秒）。
   历史上曾误写成 2000（毫秒），导致提示条要挂 2000 秒（33 分钟）才消失，
   等于永久挡在战场上（移动端尤其明显：既遮战场又吃掉点击）。 */
const BANNER_SHOW_SEC = 2.4;
const TOAST_SHOW_SEC  = 1.6;   // "不可操作"提示：更短，避免长时间遮挡视线

function showBanner(text, cls, sec){
  if(!G) return;
  G.banner = text; G.bannerCls = cls; G.bannerTimer = (sec || BANNER_SHOW_SEC);
  syncBannerEl();
}

/* 事件播报卡：负面事件直接触发时用来"喊一声"，不拦点击、自动消失 */
let evCardTimer = null;
function showEventCard(kind, name, desc, sec){
  const box = $('evcard');
  if(!box) return;
  const tag = $('evcard-tag'), nm = $('evcard-name'), ds = $('evcard-desc');
  if(tag) tag.textContent = kind === 'pos' ? '增益事件' : '负面事件';
  if(nm)  nm.textContent  = name || '';
  if(ds)  ds.textContent  = desc || '';
  box.className = (kind === 'pos' ? 'pos' : '');   // 去掉 hidden
  if(evCardTimer) clearTimeout(evCardTimer);
  evCardTimer = setTimeout(()=>{
    const b = $('evcard');
    if(b) b.className = 'hidden';
  }, (sec || 2.2) * 1000);
}
function hideEventCard(){
  if(evCardTimer) clearTimeout(evCardTimer);
  const b = $('evcard');
  if(b) b.className = 'hidden';
}
/* 横幅老化：按真实秒计时，与战场倍速、暂停状态（事件模态/登场演出/菜单）无关。
   放在 stepFrame（每帧入口）而非 update()，是为了让模态打开期间横幅也能照常消失。 */
function tickBanner(dt){
  if(!G || !G.banner) return;
  G.bannerTimer -= dt;
  if(G.bannerTimer <= 0){ G.banner = null; syncBannerEl(); }
}
function syncBannerEl(){
  const el = $('banner');
  if(G.banner){
    el.textContent = G.banner;
    el.className = G.bannerCls||'';
    el.classList.remove('hidden');
    /* 重放入场动画：连续两条横幅时给出"内容换新了"的视觉反馈 */
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  } else {
    el.classList.add('hidden');
  }
}

function showFloat(x,y,text,color){
  G.floats.push({x,y,text,color,life:1});
  // DOM 方式渲染（像素字体更清晰）；按 canvas 实际显示比例缩放位置
  const dom = document.createElement('div');
  dom.className='float-text';
  dom.textContent=text;
  dom.style.color=color;
  const layer = $('float-layer');
  const rect = cv.getBoundingClientRect();
  const wrapRect = layer.getBoundingClientRect();
  const sx = wrapRect.width / cv.width;   // canvas 逻辑像素 → 屏幕像素
  dom.style.left = (x*sx)+'px';
  dom.style.top  = (y*sx)+'px';
  dom.style.fontSize = Math.max(9, 11*sx)+'px';
  layer.appendChild(dom);
  const f = G.floats[G.floats.length-1];
  f.dom = dom;
  f.sx = sx;
  setTimeout(()=>{ dom.remove(); }, 1000);
}

function toast(msg){
  sfx('deny');                       // 所有"不可操作"提示统一给一声低鸣
  showBanner(msg, 'neg', TOAST_SHOW_SEC);
}

/* 事件奖励模态
   返回 true = 已成功弹出；false = 被拦截（阶段不符 / 仍在菜单界面） */
function openRewardModal(options){
  if(G.phase!=='playing') return false;   // 结算后不再弹出
  if(inMenuScreen()) return false;        // 标题/选关/简报期间不弹窗（入场后再触发）
  resetOverlayForModal();
  const box = $('overlay-box');
  const ov = $('overlay');
  $('overlay-title').textContent = '事件 · 援军抵达';
  $('overlay-title').className='';
  $('overlay-desc').innerHTML = '选择一名士兵加入战场（免费获得）：';
  const btn = $('overlay-btn');
  btn.style.display='none';           // 用两个卡片按钮替代单一按钮

  // 清理旧的选项容器
  const old = document.getElementById('reward-choices');
  if(old) old.remove();

  const wrap = document.createElement('div');
  wrap.id='reward-choices';
  wrap.style.cssText='display:flex;gap:14px;justify-content:center;margin-bottom:6px;flex-wrap:wrap';
  options.forEach(op=>{
    const t=BASE[op];
    const d=document.createElement('button');
    d.className='big-btn';
    d.style.width='170px';
    d.innerHTML = `<div style="font-size:30px;margin-bottom:8px">${t.emoji}</div>
      ${t.name}<div style="font-size:8px;margin-top:8px;opacity:.85">${unitStatLine(t)}</div>`;
    d.onclick = ()=>{ closeRewardModal(); resolveReward(op); };
    wrap.appendChild(d);
  });
  /* 把选项容器插到说明文字之后、按钮组之前。
     注意：refNode 必须是 box 的直接子节点，否则 insertBefore 会抛 NotFoundError。 */
  const btns = box.querySelector('.overlay-btns');
  if(btns && btns.parentNode === box){
    box.insertBefore(wrap, btns);
  } else {
    box.appendChild(wrap);
  }
  sfx('event');                      // 事件提示音
  ov.classList.remove('hidden');
  G.choiceOpen = true;               // 暂停战场：选完援军再恢复推进
  return true;
}
function closeRewardModal(){
  $('overlay').classList.add('hidden');
  const old = document.getElementById('reward-choices');
  if(old) old.remove();
  $('overlay-btn').style.display='';
  G.choiceOpen = false;              // 关闭 → 恢复战场推进
}

/* ============================================================
   左键卡牌 → 天赋详情面板（复用结算 overlay，不影响游戏进行）
   展示：当前属性 / 已解锁被动 / 下一级被动预览
   ============================================================ */
function openTalentDetail(cardId){
  const card = G.cards[cardId];
  if(!card) return;
  const t = BASE[cardId];
  const row = PASSIVE_TABLE[cardId] || {};
  const lvM = Math.pow(UPGRADE_MULT, card.lv-1);

  /* 已解锁被动 */
  const owned = Object.keys(row)
    .map(lv=>PASSIVE_INFO[row[lv]])
    .filter(p=>p && card.lv >= p.lv);
  /* 下一级被动预览 */
  const next = Object.keys(row)
    .map(lv=>PASSIVE_INFO[row[lv]])
    .filter(p=>p && card.lv < p.lv)
    .sort((a,b)=>a.lv-b.lv)[0];

  let html = `
    <div style="text-align:center;margin-bottom:10px">
      <div style="font-size:34px">${t.emoji}</div>
      <div style="font-size:14px;margin-top:4px"><b>${t.name}</b> · Lv.${card.lv}</div>
      <div style="font-size:9px;opacity:.85;margin-top:6px">
        ${unitStatLine(t, lvM, rangeUpgradeMul(card.lv))}
        ${t.kind==='none' ? '' : ` · 速 ${fmtNum(t.moveSpeed*lvM)}格/秒 · 攻速 ${(t.atkRate*lvM).toFixed(2)}`}
        ${(t.cost||1)>1 ? ` · 召唤耗 ⚡${t.cost}` : ''}
        <br>场上上限 ${unitCount(cardId)}/${unitCap(cardId)}（本回合剩余召唤 ${summonLeft(card)} 次）
        ${innateTraits(t).length ? `<br><span style="color:#ffcf4d">${innateTraits(t).join(' · ')}</span>` : ''}
      </div>
    </div>
    <div style="font-size:10px;margin-bottom:6px"><b>🎖 已解锁天赋</b></div>
  `;
  html += owned.length
    ? owned.map(p=>`<div class="talent-row" style="font-size:9px;margin-bottom:6px;line-height:1.5">
        <b>${p.name}</b>（Lv.${p.lv}）：${p.desc}</div>`).join('')
    : `<div style="font-size:9px;opacity:.7;margin-bottom:6px">暂无（Lv.2 起解锁天赋）</div>`;
  if(next){
    html += `<div style="font-size:10px;margin:10px 0 6px"><b>🔮 下一级预览 · Lv.${next.lv}</b></div>
      <div style="font-size:9px;opacity:.85;line-height:1.5">
        <b>${next.name}</b>：${next.desc}<br>
        <span style="opacity:.75">（在商店购买 Lv.${next.lv} 升级卡解锁）</span></div>`;
  } else {
    html += `<div style="font-size:9px;opacity:.7;margin-top:10px">所有天赋均已解锁 ✓</div>`;
  }

  const box = $('overlay-box');
  const ov = $('overlay');
  resetOverlayForModal();          // 天赋详情也复用此容器：先清掉结算按钮等残留
  $('overlay-title').textContent = `${t.name} · 天赋详情`;
  $('overlay-title').className='';
  $('overlay-desc').innerHTML = html;
  const btn = $('overlay-btn');
  btn.style.display='';
  btn.textContent = '关闭';
  /* 覆盖一次按钮行为：只关面板，不触发其他逻辑 */
  btn.onclick = ()=>{ closeTalentDetail(); };
  ov.classList.remove('hidden');
  logLine(`查看【${t.name}】天赋详情`, 'info');
}
function closeTalentDetail(){
  $('overlay').classList.add('hidden');
  const btn = $('overlay-btn');
  btn.style.display='';
  btn.textContent = '';
  btn.onclick = null;
}

/* ============================================================
   13. 结束
   ============================================================ */
function endGame(result){
  if(G.phase!=='playing') return;
  G.phase='over'; G.result=result;
  stopBossBgm();               // 结算立刻收掉 BOSS BGM
  G.kingBurst = null;          // 结算时把没播完的破体动画清掉
  G.triggerQueue.length=0;          // 清空未处理事件，防止结算后残留弹窗
  closeRewardModal();               // 确保奖励选择卡片不与结算画面叠加
  closeNegModal();                  // 负面事件二选一弹窗同理
  closePosModal();                  // 增益事件二选一弹窗同理
  closeTalentDetail();
  clearUnitIntro();                 // 若正播登场介绍，立即收掉（别盖住结算）
  sfx(result==='win' ? 'win' : 'lose');
  clearBattleSave();                // 战斗结束（胜/负）→ 清除战斗存档
  const ov=$('overlay');
  const t=$('overlay-title');
  const nextId = nextLevelId(G.lv.id);
  /* 本次通关是否刚好解锁了下一关 */
  let unlockedNew = false;
  if(result==='win'){
    const wasCleared = !!CLEARED[G.lv.id];
    CLEARED[G.lv.id] = true;         // 记录通关
    saveCleared();                    // 持久化（刷新不丢）
    unlockedNew = !wasCleared && nextId !== null && isLevelUnlocked(nextId);
    t.textContent = unlockedNew ? '防守成功 · 新关卡解锁！' : '防守成功！';
    t.className='win';
    $('overlay-desc').innerHTML =
      `第${G.lv.id}关《${G.lv.name}》通关——你撑过全部 ${G.lv.rounds} 个回合。<br>
       剩余基地生命：<b style="color:#5ddc7a">${Math.ceil(G.baseHp)} / ${G.baseHpMax}</b><br>
       剩余金币：<b style="color:#ffcf4d">${Math.floor(G.gold)}</b>
       ${unlockedNew ? `<br><span style="color:#ffcf4d">🔓 已解锁：第 ${nextId} 关《${LEVEL_CONFIGS[nextId].name}》</span>` : ''}`;
    logLine(`★ 第${G.lv.id}关通关！`, 'pos');
    if(unlockedNew) logLine(`🔓 解锁第${nextId}关《${LEVEL_CONFIGS[nextId].name}》`, 'gold');
  } else {
    t.textContent='基地陷落…'; t.className='lose';
    const tip = G.lv.hasLanes
      ? '提示：在商店购买升级卡强化核心兵种，并派兵保护矿场。'
      : G.lv.hasShop
        ? '提示：在商店买升级卡强化兵种，尽早出剑士顶前排、弓箭手在后排输出。'
        : '提示：尽早出剑士顶在前排，弓箭手在后排输出。';
    $('overlay-desc').innerHTML =
      `基地生命归零，防守失败。<br>
       坚持到了第 <b style="color:#ff4d6d">${G.round}</b> 回合。<br>
       ${tip}`;
    logLine('✖ 基地被攻破', 'neg');
  }
  $('overlay-btn').textContent='返回选关';
  $('overlay-btn').onclick = ()=>{ ov.classList.add('hidden'); backToLevelSelect(); };
  /* 「重打本关」按钮 */
  const rb = $('overlay-retry');
  if(rb){ rb.style.display=''; rb.onclick = ()=>{ ov.classList.add('hidden'); restart(CURRENT_LEVEL); }; }
  /* 「进入下一关」按钮：仅在通关且下一关已解锁时显示 */
  const nb = $('overlay-next');
  if(nb){
    if(result==='win' && nextId !== null && isLevelUnlocked(nextId)){
      const ncfg = LEVEL_CONFIGS[nextId];
      nb.style.display='';
      nb.textContent = `进入第 ${nextId} 关 ▶`;
      nb.onclick = ()=>{ ov.classList.add('hidden'); startBriefing(ncfg); };
    } else {
      nb.style.display='none';
      nb.onclick = null;
    }
  }
  ov.classList.remove('hidden');
  updateUI();
}

function restart(levelId){
  PROJ.length=0;
  selectedUnit=null;
  hoverTile=null;
  pendingReward=null;
  const draftBox = $('draft');
  if(draftBox) draftBox.classList.add('hidden');
  hideEventCard();
  const cx0 = $('codex');
  if(cx0) cx0.classList.add('hidden');
  resetOverlayForModal();       // 新一局不继承上一局的弹窗 DOM（结算按钮 / 事件选项卡片）
  clearUnitIntro();            // 重开时清掉登场介绍残留
  newGame(levelId || CURRENT_LEVEL);   // newGame 内部会在"已进入战场"时推进第 1 回合事件
  buildGround();               // 关卡切换后重建地面（地形有无不同）
  logLine(`第${G.lv.id}关《${G.lv.name}》开始`, 'info');
  updateUI();
}

/* 回到选关界面 */
function backToLevelSelect(){
  $('overlay').classList.add('hidden');
  $('help-overlay').classList.add('hidden');
  $('briefing').classList.add('hidden');
  $('title-screen').classList.add('hidden');
  buildLevelSelect();
  $('level-select').classList.remove('hidden');
}
/* 回到标题界面 */
function backToTitle(){
  $('overlay').classList.add('hidden');
  $('help-overlay').classList.add('hidden');
  $('level-select').classList.add('hidden');
  $('briefing').classList.add('hidden');
  refreshTitleProgress();
  $('title-screen').classList.remove('hidden');
}
/* 标题 → 选关 */
function showLevelSelect(){
  $('title-screen').classList.add('hidden');
  buildLevelSelect();
  $('level-select').classList.remove('hidden');
}

/* 选关 → 简报过场 → 战场（"选关之后再触发游戏"） */
let briefTimer = null;
let briefLevelId = 1;          // 当前简报对应的关卡（入场时必须用它，不能用 CURRENT_LEVEL）
function startBriefing(cfg){
  /* 保险：未解锁的关卡不允许进入（防止绕过选关界面直接开始） */
  if(!isLevelUnlocked(cfg.id)){
    const prev = levelIds()[levelIds().indexOf(cfg.id)-1];
    toast(`通关「第 ${prev} 关」后解锁`);
    return;
  }
  sfx('click');
  briefLevelId = cfg.id;      // ← 记住玩家选的是哪一关（入场时据此进入）
  $('title-screen').classList.add('hidden');   // 从标题直接开始也要收起标题层，否则会挡住简报
  $('level-select').classList.add('hidden');
  $('overlay').classList.add('hidden');
  $('help-overlay').classList.add('hidden');
  $('briefing').classList.remove('out');
  $('brief-stage').textContent = 'STAGE ' + cfg.id;
  $('brief-name').textContent = cfg.name;
  $('brief-desc').textContent = cfg.desc;
  const tags = [
    `▣ ${cfg.rounds} 回合`,
    `⚡ 行动值 ${cfg.apPerTurn}`,
    `❤ 基地 ${cfg.baseHp}`,
  ];
  if(cfg.spawnMul && cfg.spawnMul>1) tags.push(`☠ 出怪 ×${cfg.spawnMul}`);
  if(cfg.hasShop)    tags.push('🏪 商店开放');
  if(cfg.hasTerrain) tags.push('⛰ 地形系统');
  if(cfg.hasLanes)   tags.push('⛕ 双路地图');
  $('brief-tags').innerHTML = tags.map(t=>`<span>${t}</span>`).join('');
  $('briefing').classList.remove('hidden');
  briefingActive = true;
  clearTimeout(briefTimer);
}

/* ============================================================
   出征阵容（选卡）：第 4 关起，进场前先配牌
   ------------------------------------------------------------
   · 基础士兵（cfg.startCards：矿工 / 剑士 / 弓箭手）固定必选
   · 商店兵种最多再带 DRAFT_MAX 个，也可以一个都不带
   · 选中的兵种直接进手牌（1 级），商店不再重复卖
   ============================================================ */
const DRAFT_FROM_LEVEL = 4;    // 从第几关开始有选卡
const DRAFT_MAX = 2;           // 商店兵种最多带几个
let DRAFT_PICKS = [];          // 当前选中的商店兵种 id（重开本关不清空）
let draftLevelId = null;       // 选卡对应的关卡

/* 本关是否走选卡流程 */
function draftEnabled(cfg){
  return !!cfg && cfg.id >= DRAFT_FROM_LEVEL && !!cfg.hasShop;
}
/* 本关可选的商店兵种（按关卡白名单过滤，如圣剑士只在第四关） */
function draftPool(cfg){
  if(!cfg) return [];
  return SHOP_NEW_CARDS.filter(nc => (!nc.levels || nc.levels.includes(cfg.id)));
}
/* 切换某个可选兵种 */
function toggleDraftPick(id){
  const i = DRAFT_PICKS.indexOf(id);
  if(i >= 0){ DRAFT_PICKS.splice(i, 1); return true; }
  if(DRAFT_PICKS.length >= DRAFT_MAX){
    toast(`商店兵种最多再带 ${DRAFT_MAX} 个`);
    return false;
  }
  DRAFT_PICKS.push(id);
  return true;
}
/* 把两块卡片区画出来 */
function renderDraft(cfg){
  const fixed = $('draft-fixed'), opt = $('draft-optional');
  if(!fixed || !opt) return;
  fixed.innerHTML = '';
  opt.innerHTML = '';
  for(const id of (cfg.startCards || [])){
    const t = BASE[id];
    if(!t) continue;
    const d = document.createElement('div');
    d.className = 'draft-card fixed';
    d.innerHTML = `<span class="e">${t.emoji}</span><span class="n">${t.name}</span>`
      + `<div class="d">${t.hp}血${t.kind==='none' ? ' / 产金' : ` / ${t.dmg}攻`}</div>`;
    fixed.appendChild(d);
  }
  for(const nc of draftPool(cfg)){
    const t = BASE[nc.id];
    if(!t) continue;
    const d = document.createElement('div');
    d.className = 'draft-card' + (DRAFT_PICKS.includes(nc.id) ? ' on' : '');
    d.innerHTML = `<span class="e">${t.emoji}</span><span class="n">${t.name}</span>`
      + `<div class="d">${t.hp}血 · ${t.kind==='none'?'产金':`${t.dmg}攻`}</div>`
      + `<div class="d" style="color:#ffcf4d">◈${nc.price}${t.cost>1?` · ⚡${t.cost}`:''}</div>`;
    d.onclick = ()=>{ toggleDraftPick(nc.id); renderDraft(cfg); };
    opt.appendChild(d);
  }
  const cnt = $('draft-count');
  if(cnt) cnt.textContent = `${DRAFT_PICKS.length}/${DRAFT_MAX}`;
}
/* 打开选卡界面 */
function openDraft(cfg, levelId){
  draftLevelId = levelId;
  for(const nc of draftPool(cfg)) codexMark('player', nc.id);   // 图鉴：可选兵种算已解锁
  DRAFT_PICKS = [];
  renderDraft(cfg);
  const box = $('draft');
  if(box) box.classList.remove('hidden');
}
/* 确认阵容 → 开打 */
function confirmDraft(){
  const box = $('draft');
  if(box) box.classList.add('hidden');
  const id = draftLevelId || CURRENT_LEVEL;
  CURRENT_LEVEL = id;
  restart(id);
  const cfg = LEVEL_CONFIGS[id];
  showBanner(`第${id}关 · ${cfg ? cfg.name : ''}`, 'pos');
}

/* 简报 → 真正进入战场（"选关之后再触发游戏"）
   levelId 缺省时用"当前简报对应的关卡"，绝不能用 CURRENT_LEVEL
   （那个变量要等入场后才更新，中途读到的会是上一关）。 */
function enterBattle(cfg, levelId){
  clearTimeout(briefTimer);
  briefingActive = false;
  const targetId = (cfg && cfg.id) || levelId || briefLevelId;
  const targetCfg = (cfg && cfg.id === targetId) ? cfg : (LEVEL_CONFIGS[targetId] || cfg);
  $('briefing').classList.add('out');
  briefTimer = setTimeout(()=>{
    $('briefing').classList.add('hidden');
    $('briefing').classList.remove('out');
    /* 第 4 关起：先弹出「出征阵容」，确认后再真正开打 */
    if(draftEnabled(targetCfg)){
      openDraft(targetCfg, targetId);
      return;
    }
    CURRENT_LEVEL = targetId;
    restart(targetId);
    showBanner(`第${targetId}关 · ${targetCfg.name}`, 'pos');
  }, 260);
}

/* ============================================================
   14. 启动
   ============================================================ */
buildGround();

/* 首次用户交互 → 解锁音频（浏览器自动播放策略） */
try{
  ['pointerdown','keydown','touchstart'].forEach(ev=>{
    window.addEventListener(ev, ()=>SFX.unlock(), { once:true });
  });
}catch(e){ /* 无 window（测试桩） */ }

/* 关卡选择界面（含缩略图 / 通关记录 / 解锁状态） */
function buildLevelSelect(){
  const wrap = $('level-cards');
  if(!wrap) return;
  wrap.innerHTML = '';
  for(const id of levelIds()){
    const cfg = LEVEL_CONFIGS[id];
    const unlocked = isLevelUnlocked(id);
    const cleared = !!CLEARED[id];
    const prevId = levelIds()[levelIds().indexOf(id)-1];
    const d = document.createElement('div');
    d.className = 'level-card' + (unlocked ? '' : ' locked') + (cleared ? ' cleared' : '');
    d.innerHTML = `
      ${cleared ? '<div class="level-clear">★ 已通关</div>'
                : (!unlocked ? '<div class="level-lock">🔒 未解锁</div>' : '')}
      <div class="level-thumb">${levelThumb(cfg)}</div>
      <div class="level-body">
        <div class="level-num">第 ${cfg.id} 关</div>
        <div class="level-title">${cfg.name}</div>
        <div class="level-sub">${cfg.sub}</div>
        <div class="level-desc">${unlocked ? cfg.desc : `通关「第 ${prevId} 关」后解锁`}</div>
        <div class="level-meta">
          <span>▣ ${cfg.rounds} 回合</span>
          <span>⚡ ${cfg.apPerTurn}</span>
          <span>❤ ${cfg.baseHp}</span>
          ${cfg.hasShop ? '<span class="tag">商店</span>' : ''}
          ${cfg.hasTerrain ? '<span class="tag">地形</span>' : ''}
          ${cfg.hasLanes ? '<span class="tag">双路</span>' : ''}
        </div>
        ${cleared ? '<div class="level-best">★ 最佳：已守住基地</div>' : ''}
        <div class="level-go">${unlocked ? '开始 ▶' : '🔒 锁定'}</div>
      </div>
    `;
    if(unlocked){
      d.onclick = ()=> startBriefing(cfg);
    } else {
      d.onclick = ()=> toast(`通关「第 ${prevId} 关」后解锁`);
    }
    wrap.appendChild(d);
  }
}

/* 关卡缩略图（纯 CSS 像素示意） */
function levelThumb(cfg){
  let html = '<div class="t-grid"></div>';
  if(cfg.hasRing){
    /* 环岩：中央一圈岩壁（圆形边框示意），中心是基地，东西南三处是林地缺口 */
    html += '<div class="t-ring"></div>';
    html += '<div class="t-spot" style="left:50%;top:50%;margin:-6px 0 0 -6px;background:#ffcf4d"></div>';
    html += '<div class="t-gap" style="left:50%;top:50%;margin:-5px 0 0 -30px"></div>';   /* 西缺口 */
    html += '<div class="t-gap" style="left:50%;top:50%;margin:-5px 0 0 20px"></div>';    /* 东缺口 */
    html += '<div class="t-gap" style="left:50%;top:50%;margin:20px 0 0 -5px"></div>';    /* 南缺口 */
    html += '<div class="t-spot" style="left:12px;top:8px;background:#ff4d6d"></div>';     /* 左上出怪口 */
    html += '<div class="t-spot" style="right:12px;top:8px;background:#ff4d6d"></div>';    /* 右上出怪口 */
    html += '<div class="t-spot" style="left:50%;bottom:3px;margin-left:-5px;width:10px;height:10px;background:#ff4d6d"></div>';
    html += '<div class="t-label">环形岩壁 · 三缺口</div>';
  } else if(cfg.hasLanes){
    /* 双路：上路 + 中央岩壁 + 下路 */
    html += '<div class="t-band" style="top:22px;height:14px;background:rgba(60,120,70,.55)"></div>';
    html += '<div class="t-band" style="top:42px;height:12px"></div>';
    html += '<div class="t-band" style="top:66px;height:16px;background:rgba(60,90,110,.55)"></div>';
    html += '<div class="t-spot" style="left:24px;top:22px;background:#ffcf4d"></div>';
    html += '<div class="t-spot" style="left:24px;top:68px;background:#ff4d6d"></div>';
    html += '<div class="t-label">上路 · 矿场 / 下路 · 基地</div>';
  } else {
    html += '<div class="t-band" style="top:40px;height:18px;background:rgba(60,120,70,.5)"></div>';
    html += '<div class="t-spot" style="left:20px;top:42px;background:#ff4d6d"></div>';
    html += '<div class="t-spot" style="right:20px;top:42px;background:#ffcf4d"></div>';
    html += '<div class="t-label">单路 · 守卫基地</div>';
  }
  return html;
}

/* 刷新标题界面的进度提示（已通关数 / 已解锁关数） */
function refreshTitleProgress(){
  const el = $('ts-progress');
  /* 继续 / 放弃上局：有战斗存档时显示 */
  const cb = $('btn-continue');
  if(cb) cb.style.display = hasBattleSave() ? '' : 'none';
  const ab = $('btn-abandon');
  if(ab) ab.style.display = hasBattleSave() ? '' : 'none';
  if(!el) return;
  const ids = levelIds();
  const clearedCount = ids.filter(id=>CLEARED[id]).length;
  const unlockedMax = maxUnlockedLevel();
  if(clearedCount === 0){
    el.style.display = '';
    el.innerHTML = `进度：<b>0</b> / ${ids.length} 关通关`;
  } else {
    el.style.display = '';
    const done = clearedCount === ids.length;
    el.innerHTML = done
      ? `🏆 <b>全部 ${ids.length} 关通关</b>！`
      : `进度：<b>${clearedCount}</b> / ${ids.length} 关通关 · 最新解锁 <b>第 ${unlockedMax} 关</b>`;
  }
}

/* 音效按钮状态同步（🔊 / 🔇） */
function syncSoundBtn(){
  const sb = $('btn-sound');
  if(!sb) return;
  const m = SFX.isMuted();
  sb.textContent = m ? '🔇' : '🔊';
  sb.title = m ? '音效：已静音（点击开启）' : '音效：开启（点击静音）';
  if(sb.classList && sb.classList.toggle) sb.classList.toggle('off', m);
}

/* 按钮绑定 */
/* ============================================================
   战场倍速（×1 常速 / ×2 二倍速）
   ------------------------------------------------------------
   只影响战场推进（update）：单位移动、攻击、弹道、轰炸预警、
   登场演出倒计时都随倍速加快；事件弹窗 / 商店等 DOM 交互不受影响。
   偏好写入 localStorage，刷新后保留。 */
let GAME_SPEED = 1;
const SPEED_KEY = 'frontline-speed';

function syncSpeedBtn(){
  const b = $('btn-speed');
  if(b){
    b.textContent = GAME_SPEED === 2 ? '⏩ 速度 ×2' : '⏩ 速度 ×1';
    b.title = '点击切换战场倍速（当前 ×' + GAME_SPEED + '）';
  }
}
function setGameSpeed(s){
  GAME_SPEED = (s === 2) ? 2 : 1;
  try{ localStorage.setItem(SPEED_KEY, String(GAME_SPEED)); }catch(e){ /* 隐私模式等忽略 */ }
  syncSpeedBtn();
}
function toggleGameSpeed(){ setGameSpeed(GAME_SPEED === 2 ? 1 : 2); }

/* 每帧入口：把真实帧时间换算成战场推进时间。
   单帧推进最多 0.05 秒（与主循环的钳制一致）：
   60fps 下 ×2 = 1/30 秒 < 0.05，正好翻倍；
   低帧率机器上宁可比 2 倍慢一点，也不让单步跨太大导致穿透/跳格。 */
function stepFrame(dt){
  tickBanner(dt);       // 提示条按真实秒老化（不受倍速影响，暂停时也照常消失）
  update(Math.min(dt * GAME_SPEED, 0.05));
}

/* ============================================================
   图鉴界面（标题页 → 图鉴）
   ============================================================ */
let codexTab = 'units';
function codexCard(unlocked, t, tagText, statText){
  const d = document.createElement('div');
  d.className = 'cx-card' + (unlocked ? '' : ' locked');
  d.innerHTML = `<div class="cx-e">${unlocked ? (t.emoji || '▪') : '❔'}</div>`
    + `<div class="cx-n">${unlocked ? t.name : '？？？'}</div>`
    + (tagText ? `<div class="cx-k">${tagText}</div>` : '')
    + `<div class="cx-s">${unlocked ? (statText || '') : '尚未解锁'}</div>`;
  return d;
}
function renderCodex(tab){
  if(tab) codexTab = tab;
  const wrap = $('codex-list');
  if(wrap){
    wrap.innerHTML = '';
    if(codexTab === 'events'){
      const rows = [];
      for(const k in POS_EVENTS) rows.push({ t: POS_EVENTS[k], kind: '增益' });
      for(const k in NEG_EVENTS) rows.push({ t: NEG_EVENTS[k], kind: '负面' });
      for(const r of rows){
        const d = document.createElement('div');
        d.className = 'cx-card';
        d.innerHTML = `<div class="cx-e">${r.t.emoji || (r.kind === '增益' ? '✨' : '⚠️')}</div>`
          + `<div class="cx-n">${r.t.name}</div>`
          + `<div class="cx-k">${r.kind}事件</div>`
          + `<div class="cx-s">${r.t.desc || ''}</div>`;
        wrap.appendChild(d);
      }
    } else {
      const ids  = codexTab === 'monsters' ? CODEX_MONSTERS : CODEX_UNITS;
      const seen = codexTab === 'monsters' ? CODEX.monsters : CODEX.units;
      for(const id of ids){
        const t = BASE[id];
        if(!t) continue;
        const ok = !!seen[id];
        const stat = ok ? (codexTab === 'monsters' ? monsterStatLine(t) : codexUnitLine(t)) : '';
        wrap.appendChild(codexCard(ok, t, '', stat));
      }
    }
  }
  const cnt = $('codex-count');
  if(cnt){
    const p = codexProgress();
    const evs = Object.keys(POS_EVENTS).length + Object.keys(NEG_EVENTS).length;
    cnt.textContent = `兵种 ${p.units}/${p.unitsTotal} · 怪兽 ${p.monsters}/${p.monstersTotal} · 事件 ${evs}`;
  }
  const tabs = [['cx-tab-units','units'], ['cx-tab-monsters','monsters'], ['cx-tab-events','events']];
  for(const [id, key] of tabs){
    const b = $(id);
    if(b && b.classList){ b.classList[key === codexTab ? 'add' : 'remove']('on'); }
  }
}
/* 图鉴里兵种的数值描述（分行，避免窄卡片里换行难看） */
function codexUnitLine(t){
  if(!t) return '';
  if(t.kind === 'none' || !(t.range > 0)) return `驻守 · 血 ${t.hp}<br>不攻击 · 驻矿场产金`;
  let out = `${unitKindLabel(t)} · 血 ${t.hp} · 伤 ${t.dmg}<br>攻距 ${t.range} 格 · 攻速 ${t.atkRate}/秒<br>移速 ${t.moveSpeed}`;
  const extra = innateTraits(t);
  if(extra.length) out += `<br><span class="cx-t">${extra.join(' · ')}</span>`;
  return out;
}
/* 兵种的固有特性（图鉴 / 天赋详情共用）：只在有对应字段时才列出来 */
function innateTraits(t){
  const extra = [];
  if(!t) return extra;
  if(t.stun) extra.push(`命中眩晕 ${t.stun} 秒`);
  if(t.splash) extra.push(`溅射 ${Math.round(t.splash*100)}%`);
  if(t.taunt) extra.push(`嘲讽 ${t.taunt} 格`);
  if(t.allyAtkAura) extra.push(`友军攻击 +${Math.round(t.allyAtkAura*100)}%`);
  if(t.dmgReduce) extra.push(`自身受伤 -${Math.round(t.dmgReduce*100)}%`);
  if(t.deathBomb) extra.push(`阵亡爆炸 ${t.deathBomb.dmg} 伤 / ${t.deathBomb.radius} 格`);
  if(t.cost && t.cost>1) extra.push(`召唤耗 ⚡${t.cost}`);
  if(t.tier) extra.push(t.tier === 'boss' ? 'BOSS' : '精英');
  return extra;
}

/* 图鉴里怪兽的数值描述（分行） */
function monsterStatLine(t){
  if(!t) return '';
  const traits = [];
  if(t.rangedResist) traits.push(`远程减伤 ${Math.round(t.rangedResist * 100)}%`);
  if(t.flying) traits.push('飞行');
  if(t.rangedOnly) traits.push('仅远程可打');
  if(t.baseOnly) traits.push('只打基地');
  if(t.antiMine) traits.push('专拆矿场');
  if(t.raiseFallen) traits.push('击杀转化骷髅');
  if(t.aura) traits.push(`统御 +${Math.round(t.aura * 100)}% 攻`);
  if(t.stomp) traits.push('践踏');
  if(t.bombRaid) traits.push('定点轰炸');
  if(t.shaman) traits.push('群体回血');
  if(t.minion) traits.push(`每 ${t.minion.every} 秒召唤骷髅`);
  if(t.deathSummon) traits.push(`阵亡召唤 ${t.deathSummon.count} 骷髅`);
  const _ccr = (typeof t.ccResist === 'number') ? t.ccResist
                : ((t.tier === 'elite' || t.tier === 'boss') ? CC_RESIST_TIER : 0);
  if(_ccr > 0) traits.push(`控制减免 ${Math.round(_ccr * 100)}%`);
  if(t.spawnTransform) traits.push(`出场转化 ${t.spawnTransform} 名我方士兵`);
  if(t.tier === 'elite') traits.push('精英');
  if(t.tier === 'boss')  traits.push('BOSS');
  let out = `血 ${t.hp} · 伤 ${t.dmg}<br>攻距 ${t.range} 格 · 攻速 ${t.atkRate}/秒<br>移速 ${t.moveSpeed}`;
  if(traits.length) out += `<br><span class="cx-t">${traits.join(' · ')}</span>`;
  return out;
}
/* 重置进度：清空通关记录 / 战斗存档 / 图鉴（测试与重玩用） */
function resetProgress(){
  let ok = true;
  try{
    if(typeof window !== 'undefined' && typeof window.confirm === 'function'){
      ok = window.confirm('确定重置进度吗？\n将清空：通关记录、战斗存档、图鉴收录。');
    }
  }catch(e){ ok = true; }
  if(!ok) return false;
  for(const k in CLEARED) delete CLEARED[k];
  try{ saveCleared(); }catch(e){}
  try{ clearBattleSave(); }catch(e){}
  for(const k in CODEX.units)    delete CODEX.units[k];
  for(const k in CODEX.monsters) delete CODEX.monsters[k];
  saveCodex();
  if(typeof refreshTitleProgress === 'function') refreshTitleProgress();
  renderCodex(codexTab);
  toast('进度已重置');
  return true;
}

function openCodex(){
  renderCodex('units');
  const b = $('codex');
  if(b) b.classList.remove('hidden');
  sfx('click');
}
function closeCodex(){
  const b = $('codex');
  if(b) b.classList.add('hidden');
}

function bindButtons(){
  /* 音效开关 */
  const sb = $('btn-sound');
  if(sb) sb.onclick = ()=>{ SFX.unlock(); SFX.toggle(); syncSoundBtn(); sfx('click'); };
  syncSoundBtn();

  /* 战场倍速开关：读取上次保存的偏好 */
  const spb = $('btn-speed');
  if(spb) spb.onclick = ()=>{ toggleGameSpeed(); sfx('click'); };
  try{
    const saved = +localStorage.getItem(SPEED_KEY);
    if(saved === 2) GAME_SPEED = 2;
  }catch(e){ /* 忽略 */ }
  syncSpeedBtn();

  $('btn-end-turn').onclick = endTurn;
  $('btn-restart').onclick = backToTitle;   // 战斗内返回主界面（主界面再决定继续 / 放弃）
  const dg = $('draft-go');
  if(dg) dg.onclick = ()=>{ sfx('click'); confirmDraft(); };
  $('btn-help').onclick = ()=> $('help-overlay').classList.remove('hidden');
  $('help-close').onclick = ()=> $('help-overlay').classList.add('hidden');
  const rb = $('btn-refresh');
  if(rb) rb.onclick = ()=> refreshShop(1, false);

  /* 标题界面 */
  const bs = $('btn-start');
  if(bs) bs.onclick = showLevelSelect;
  const bc = $('btn-continue');
  if(bc) bc.onclick = continueBattle;
  /* 放弃上次战斗：清掉存档，回到全新一局 */
  const ba = $('btn-abandon');
  if(ba) ba.onclick = ()=>{
    if(!hasBattleSave()){ toast('没有可放弃的存档'); return; }
    let ok = true;
    try{
      if(typeof window !== 'undefined' && typeof window.confirm === 'function'){
        ok = window.confirm('放弃上次战斗？进度将不再保留。');
      }
    }catch(e){ ok = true; }
    if(!ok) return;
    clearBattleSave();
    refreshTitleProgress();
    toast('已放弃上次战斗');
    sfx('click');
  };
  const bh = $('btn-help-title');
  if(bh) bh.onclick = ()=> $('help-overlay').classList.remove('hidden');
  /* 图鉴 */
  const cxBtn = $('btn-codex');
  if(cxBtn) cxBtn.onclick = openCodex;
  const cxClose = $('codex-close');
  if(cxClose) cxClose.onclick = closeCodex;
  const cxReset = $('cx-reset');
  if(cxReset) cxReset.onclick = ()=>{ sfx('click'); resetProgress(); };
  const cxTabs = [['cx-tab-units','units'], ['cx-tab-monsters','monsters'], ['cx-tab-events','events']];
  for(const [id, key] of cxTabs){
    const b = $(id);
    if(b) b.onclick = ()=>{ sfx('click'); renderCodex(key); };
  }

  /* 选关返回 */
  const lb = $('ls-back');
  if(lb) lb.onclick = backToTitle;

  /* 简报：点击任意处进入战场（用简报记住的关卡，不能用 CURRENT_LEVEL） */
  const bf = $('briefing');
  if(bf) bf.onclick = ()=>{
    if(!briefingActive) return;
    enterBattle(LEVEL_CONFIGS[briefLevelId], briefLevelId);
  };

  /* 空格 / 回车：标题→选关；简报→入场 */
  window.addEventListener('keydown', (e)=>{
    if(e.code==='Space' || e.code==='Enter'){
      const tsOpen = !$('title-screen').classList.contains('hidden');
      if(tsOpen){ e.preventDefault(); showLevelSelect(); return; }
      if(briefingActive){ e.preventDefault(); enterBattle(LEVEL_CONFIGS[briefLevelId], briefLevelId); return; }
    }
  });

  const ob = $('overlay-btn');
  if(ob) ob.onclick = null;   // 由 endGame 动态绑定
}

/* 初始化：先显示标题界面 */
let selectedUnit = null;
newGame(1);            // 预创建一份状态（供渲染循环读取，避免空指针）
bindButtons();
updateUI();
refreshTitleProgress();                          // 显示通关 / 解锁进度
$('title-screen').classList.remove('hidden');   // 开局停在标题界面
$('level-select').classList.add('hidden');

lastT = performance.now();
(function loop(t){
  const dt = Math.min((t-lastT)/1000, 0.05);
  lastT = t;
  stepFrame(dt);        // 战场推进（内部按 GAME_SPEED 换算，见 stepFrame 注释）
  draw();
  requestAnimationFrame(loop);
})(performance.now());
